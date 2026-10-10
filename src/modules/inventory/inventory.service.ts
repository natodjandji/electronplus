import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import {
  ProductsService,
  STOCK_CHANGED_EVENT,
  StockChangedEvent,
} from '../products/products.service';
import { StockAlert, StockAlertLevel } from './entities/stock-alert.entity';

export const STOCK_ALERT_RAISED_EVENT = 'stock.alert.raised';

export interface StockAlertRaisedEvent {
  productId: string;
  sku: string;
  name: string;
  level: StockAlertLevel;
  stock: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly repo: FirestoreRepository<StockAlert>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.repo = new FirestoreRepository<StockAlert>(firestore, Collections.STOCK_ALERTS);
  }

  @OnEvent(STOCK_CHANGED_EVENT)
  async handleStockChanged(payload: StockChangedEvent): Promise<void> {
    // EventEmitter2's emit() (used by ProductsService.emitStockChanged, fired
    // on every order, stock adjustment and ERP sync) never awaits or catches
    // a listener's returned promise — an uncaught rejection here becomes an
    // unhandled promise rejection that crashes the whole process (no
    // process.on('unhandledRejection') handler is installed). Every sibling
    // @OnEvent handler in notifications.service.ts wraps its body the same
    // way for the same reason; this one was the one outlier.
    try {
      await this.processStockChanged(payload);
    } catch (error) {
      this.logger.error(`Failed to process stock change for ${payload.sku}`, error as Error);
    }
  }

  private async processStockChanged(payload: StockChangedEvent): Promise<void> {
    const threshold =
      payload.minStockThreshold ??
      this.config.get('LOW_STOCK_DEFAULT_THRESHOLD', { infer: true }) ??
      10;

    // An ERP run reports every product whose stock moved — hundreds at once
    // with the principal catalog. An alert can only be open for a product
    // that was at or below its threshold, so one that stays above it needs
    // no lookup (a query read each).
    if (
      payload.previousStock !== undefined &&
      payload.previousStock > threshold &&
      payload.stock > threshold
    ) {
      return;
    }
    if (payload.imported && payload.stock > threshold) return;

    const existingActive = payload.imported
      ? null
      : await this.repo.findOne([
          { field: 'productId', op: '==', value: payload.productId },
          { field: 'active', op: '==', value: true },
        ]);

    if (payload.stock > threshold) {
      if (existingActive) {
        await this.repo.patch(existingActive.id, { active: false, resolvedAt: new Date() });
      }
      return;
    }

    const level = payload.stock === 0 ? StockAlertLevel.OUT : StockAlertLevel.LOW;
    if (existingActive && existingActive.level === level) {
      await this.repo.patch(existingActive.id, { stockAtTrigger: payload.stock });
      return;
    }
    if (existingActive) {
      await this.repo.patch(existingActive.id, { active: false, resolvedAt: new Date() });
    }

    await this.repo.insert({
      productId: payload.productId,
      sku: payload.sku,
      name: payload.name,
      level,
      stockAtTrigger: payload.stock,
      threshold,
      active: true,
    });

    // A product that arrives already low (the first import of a catalog,
    // a new item not stocked yet) is listed with the other alerts, but
    // nothing ran out: no notification or email per product — the first
    // principal sync would otherwise send one for every empty item.
    if (payload.imported) return;

    this.logger.warn(
      `Stock alert [${level}] for ${payload.sku}: ${payload.stock} units (threshold ${threshold})`,
    );
    this.events.emit(STOCK_ALERT_RAISED_EVENT, {
      productId: payload.productId,
      sku: payload.sku,
      name: payload.name,
      level,
      stock: payload.stock,
    } satisfies StockAlertRaisedEvent);
  }

  findActiveAlerts(): Promise<StockAlert[]> {
    return this.repo.findAll({
      where: [{ field: 'active', op: '==', value: true }],
      orderBy: { field: 'stockAtTrigger', direction: 'asc' },
    });
  }

  stockInWarehouse(warehouseId: string) {
    return this.productsService.stockInWarehouse(warehouseId);
  }
}
