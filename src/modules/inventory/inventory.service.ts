import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { ProductsService, STOCK_CHANGED_EVENT, StockChangedEvent } from '../products/products.service';
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
    const threshold =
      payload.minStockThreshold ?? this.config.get('LOW_STOCK_DEFAULT_THRESHOLD', { infer: true }) ?? 10;
    const existingActive = await this.repo.findOne([
      { field: 'productId', op: '==', value: payload.productId },
      { field: 'active', op: '==', value: true },
    ]);

    if (payload.stock > threshold) {
      if (existingActive) {
        await this.repo.update(existingActive.id, { active: false, resolvedAt: new Date() });
      }
      return;
    }

    const level = payload.stock === 0 ? StockAlertLevel.OUT : StockAlertLevel.LOW;
    if (existingActive && existingActive.level === level) {
      await this.repo.update(existingActive.id, { stockAtTrigger: payload.stock });
      return;
    }
    if (existingActive) {
      await this.repo.update(existingActive.id, { active: false, resolvedAt: new Date() });
    }

    const alert = await this.repo.create({
      productId: payload.productId,
      sku: payload.sku,
      name: payload.name,
      level,
      stockAtTrigger: payload.stock,
      threshold,
      active: true,
    });

    this.logger.warn(`Stock alert [${level}] for ${payload.sku}: ${payload.stock} units (threshold ${threshold})`);
    this.events.emit(STOCK_ALERT_RAISED_EVENT, {
      productId: alert.productId,
      sku: alert.sku,
      name: alert.name,
      level: alert.level,
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
