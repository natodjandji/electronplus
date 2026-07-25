import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import { ERP_SYNC_ERROR_EVENT, ErpSyncErrorEvent } from '../erp-sync/sync.service';
import { INVOICE_DUE_ALERT_EVENT, InvoiceDueAlertEvent } from '../finance/finance.service';
import { PayableDueStatus } from '../finance/entities/supplier-payable.entity';
import { STOCK_ALERT_RAISED_EVENT, StockAlertRaisedEvent } from '../inventory/inventory.service';
import { StockAlertLevel } from '../inventory/entities/stock-alert.entity';
import { STOCK_CHANGED_EVENT, StockChangedEvent } from '../products/products.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

const OPS_ROLES = [Role.ADMIN, Role.WAREHOUSE_OPERATOR];

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly repo: FirestoreRepository<Notification>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly gateway: NotificationsGateway,
  ) {
    this.repo = new FirestoreRepository<Notification>(firestore, Collections.NOTIFICATIONS);
  }

  findForRole(role: Role): Promise<Notification[]> {
    return this.repo.findAll({
      where: [{ field: 'targetRoles', op: 'array-contains', value: role }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 100,
    });
  }

  async markRead(id: string): Promise<void> {
    await this.repo.update(id, { read: true });
  }

  private async create(
    type: NotificationType,
    title: string,
    message: string,
    targetRoles: Role[],
    payload?: Record<string, unknown>,
  ): Promise<Notification> {
    const notification = await this.repo.create({
      type,
      title,
      message,
      targetRoles,
      payload,
      read: false,
    });
    this.gateway.broadcastToRoles(targetRoles, 'notification.created', notification);
    return notification;
  }

  @OnEvent(STOCK_ALERT_RAISED_EVENT)
  async handleStockAlert(payload: StockAlertRaisedEvent): Promise<void> {
    try {
      const isOut = payload.level === StockAlertLevel.OUT;
      await this.create(
        isOut ? NotificationType.OUT_OF_STOCK : NotificationType.LOW_STOCK,
        isOut ? 'Producto agotado' : 'Stock bajo',
        `${payload.name} (${payload.sku}): ${payload.stock} unidades disponibles`,
        OPS_ROLES,
        { ...payload },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create stock alert notification for ${payload.sku}`,
        error as Error,
      );
    }
  }

  @OnEvent(INVOICE_DUE_ALERT_EVENT)
  async handleInvoiceDue(payload: InvoiceDueAlertEvent): Promise<void> {
    try {
      const isOverdue = payload.dueStatus === PayableDueStatus.OVERDUE;
      await this.create(
        isOverdue ? NotificationType.INVOICE_OVERDUE : NotificationType.INVOICE_DUE_SOON,
        isOverdue ? 'Factura vencida' : 'Factura por vencer',
        `${payload.supplierName} · Factura ${payload.invoiceNumber} vence el ${payload.dueDate}`,
        [Role.ADMIN],
        { ...payload },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create invoice due notification for ${payload.invoiceNumber}`,
        error as Error,
      );
    }
  }

  @OnEvent(ERP_SYNC_ERROR_EVENT)
  async handleErpSyncError(payload: ErpSyncErrorEvent): Promise<void> {
    try {
      await this.create(
        NotificationType.SYNC_ERROR,
        'Error de sincronización con Profit Plus',
        payload.message,
        [Role.ADMIN],
        {
          ...payload,
        },
      );
    } catch (error) {
      this.logger.error('Failed to create ERP sync error notification', error as Error);
    }
  }

  @OnEvent(STOCK_CHANGED_EVENT)
  handleStockChanged(payload: StockChangedEvent): void {
    try {
      this.gateway.broadcastToRoles(OPS_ROLES, 'stock.changed', payload);
    } catch (error) {
      this.logger.error(`Failed to broadcast stock change for ${payload.sku}`, error as Error);
    }
  }
}
