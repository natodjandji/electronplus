import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { STORE_TIME_ZONE, storeDay } from '../../common/utils/store-day';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import {
  ERP_EXPORT_SUCCEEDED_EVENT,
  ERP_SYNC_ERROR_EVENT,
  ERP_SYNC_SUCCEEDED_EVENT,
  type ErpExportSucceededEvent,
  type ErpSyncErrorEvent,
  type ErpSyncErrorKind,
  type ErpSyncSucceededEvent,
} from '../erp-sync/sync.service';
import { INVOICE_DUE_ALERT_EVENT, InvoiceDueAlertEvent } from '../finance/finance.service';
import { PayableDueStatus } from '../finance/entities/supplier-payable.entity';
import { EXPENSE_DUE_ALERT_EVENT, ExpenseDueAlertEvent } from '../expenses/expenses.service';
import { ExpenseDueStatus } from '../expenses/entities/expense.entity';
import { STOCK_ALERT_RAISED_EVENT, StockAlertRaisedEvent } from '../inventory/inventory.service';
import { StockAlertLevel } from '../inventory/entities/stock-alert.entity';
import { STOCK_CHANGED_EVENT, StockChangedEvent } from '../products/products.service';
import { CHAT_HANDOFF_EVENT, ChatHandoffEvent } from '../messaging/messaging.events';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

const OPS_ROLES = [Role.ADMIN, Role.WAREHOUSE_OPERATOR];

const NOTIFICATIONS_LIST_LIMIT = 50;

const SYNC_ERROR_TITLE = 'Error de sincronización con Profit Plus';
/** Under Firestore's 500 writes per batch. */
const DELETE_BATCH = 400;
const syncErrorTime = new Intl.DateTimeFormat('es-VE', {
  timeZone: STORE_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

/** A day's sync-error notification: the latest error, and how often it
 * happened (inventory runs) or which sales are still waiting (exports). */
export function syncErrorMessage(
  kind: ErpSyncErrorKind,
  error: string,
  occurrences: number,
  lastAt: Date,
  orderIds?: string[],
): string {
  if (kind === 'export') {
    const sales = orderIds?.length || 1;
    return `${sales === 1 ? 'Una venta' : `${sales} ventas`} sin enviar a Profit Plus. Último error: ${error}`;
  }
  if (occurrences <= 1) return error;
  // The time ends in its own period ("3:45 p. m."), so the sentence doesn't add one.
  return `${error} · ${occurrences} veces hoy, la última a las ${syncErrorTime.format(lastAt)}`;
}

/** An inventory run's error, grouped or from before grouping. */
function isInventoryError(notification: Notification): boolean {
  return notification.syncErrorKind
    ? notification.syncErrorKind !== 'export'
    : notification.payload?.direction === 'inbound';
}

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(value as Date);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly repo: FirestoreRepository<Notification>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly gateway: NotificationsGateway,
  ) {
    this.repo = new FirestoreRepository<Notification>(firestore, Collections.NOTIFICATIONS);
  }

  /** The bell's list. Every fetch reads each returned doc, so it stays
   * short — new ones arrive over the socket without a refetch. */
  findForRole(role: Role): Promise<Notification[]> {
    return this.repo.findAll({
      where: [{ field: 'targetRoles', op: 'array-contains', value: role }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: NOTIFICATIONS_LIST_LIMIT,
    });
  }

  async markRead(id: string, role: Role): Promise<void> {
    // A notification names the roles it's for — only one of them may mark
    // it read, mirroring the same restriction firestore.rules already
    // applies to direct client access.
    const notification = await this.repo.getOrThrow(id, 'Notification not found');
    if (!notification.targetRoles.includes(role)) {
      throw new ForbiddenException('This notification is not addressed to your role');
    }
    await this.repo.update(id, { read: true });
  }

  /** One batched write instead of one repo.update() per unread notification —
   * bounded by findForRole's own limit, so this stays a single batch. */
  async markAllRead(role: Role): Promise<void> {
    const unread = (await this.findForRole(role)).filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = this.firestore.batch();
    for (const notification of unread) {
      batch.update(this.repo.doc(notification.id), { read: true });
    }
    await batch.commit();
  }

  async delete(id: string, role: Role): Promise<void> {
    const notification = await this.repo.getOrThrow(id, 'Notification not found');
    if (!notification.targetRoles.includes(role)) {
      throw new ForbiddenException('This notification is not addressed to your role');
    }
    await this.repo.delete(id);
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

  @OnEvent(EXPENSE_DUE_ALERT_EVENT)
  async handleExpenseDue(payload: ExpenseDueAlertEvent): Promise<void> {
    try {
      const isOverdue = payload.dueStatus === ExpenseDueStatus.OVERDUE;
      await this.create(
        isOverdue ? NotificationType.EXPENSE_OVERDUE : NotificationType.EXPENSE_DUE_SOON,
        isOverdue ? 'Gasto vencido' : 'Gasto por vencer',
        `${payload.name} vence el ${payload.dueDate}`,
        [Role.ADMIN],
        { ...payload },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create expense due notification for ${payload.name}`,
        error as Error,
      );
    }
  }

  @OnEvent(ERP_SYNC_ERROR_EVENT)
  async handleErpSyncError(payload: ErpSyncErrorEvent): Promise<void> {
    try {
      await this.recordSyncError(payload, new Date());
    } catch (error) {
      this.logger.error('Failed to create ERP sync error notification', error as Error);
    }
  }

  /** Adds the error to the day's notification for its kind, or opens that
   * notification. Read stays read: the admin already knows, and a bridge
   * that's down fails every 15 minutes. */
  private async recordSyncError(event: ErpSyncErrorEvent, now: Date): Promise<void> {
    const day = storeDay(now);
    const ref = this.repo.doc(`sync-error-${event.kind}-${day}`);
    const { notification, isNew } = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() as Omit<Notification, 'id'>) : null;
      const occurrences = (current?.occurrences ?? 0) + 1;
      const orderIds =
        event.kind === 'export'
          ? [
              ...new Set([
                ...(current?.orderIds ?? []),
                ...(event.reference ? [event.reference] : []),
              ]),
            ]
          : undefined;
      const data: Omit<Notification, 'id'> = {
        type: NotificationType.SYNC_ERROR,
        title: SYNC_ERROR_TITLE,
        message: syncErrorMessage(event.kind, event.message, occurrences, now, orderIds),
        targetRoles: [Role.ADMIN],
        payload: { ...event },
        read: current?.read ?? false,
        syncErrorKind: event.kind,
        day,
        occurrences,
        lastOccurredAt: now,
        ...(orderIds ? { orderIds } : {}),
        createdAt: current ? toDate(current.createdAt) : now,
        updatedAt: now,
      };
      tx.set(ref, data);
      return { notification: { id: ref.id, ...data }, isNew: !current };
    });
    this.gateway.broadcastToRoles(
      [Role.ADMIN],
      isNew ? 'notification.created' : 'notification.updated',
      notification,
    );
  }

  /** An inventory run worked: the inventory errors last seen before it
   * started are over, whatever day they're from. A removal warning this
   * same run raised stays. */
  @OnEvent(ERP_SYNC_SUCCEEDED_EVENT)
  async handleErpSyncSucceeded({ startedAt }: ErpSyncSucceededEvent): Promise<void> {
    try {
      const over = (await this.syncErrors()).filter(
        (n) => isInventoryError(n) && toDate(n.lastOccurredAt ?? n.createdAt) < toDate(startedAt),
      );
      await this.removeAll(over.map((n) => n.id));
    } catch (error) {
      this.logger.error('Failed to clear resolved ERP sync notifications', error as Error);
    }
  }

  /** A sale reached Profit Plus: it leaves the export notifications, and a
   * notification with no sale left goes away. */
  @OnEvent(ERP_EXPORT_SUCCEEDED_EVENT)
  async handleErpExportSucceeded({ orderId }: ErpExportSucceededEvent): Promise<void> {
    try {
      const over: string[] = [];
      for (const notification of await this.syncErrors()) {
        if (!notification.syncErrorKind) {
          if (notification.payload?.reference === orderId) over.push(notification.id);
          continue;
        }
        if (notification.syncErrorKind !== 'export' || !notification.orderIds?.includes(orderId)) {
          continue;
        }
        const orderIds = notification.orderIds.filter((id) => id !== orderId);
        if (orderIds.length === 0) {
          over.push(notification.id);
          continue;
        }
        const message = syncErrorMessage(
          'export',
          String(notification.payload?.message ?? ''),
          notification.occurrences ?? 1,
          toDate(notification.lastOccurredAt ?? notification.createdAt),
          orderIds,
        );
        await this.repo.update(notification.id, { orderIds, message });
        this.gateway.broadcastToRoles([Role.ADMIN], 'notification.updated', {
          ...notification,
          orderIds,
          message,
        });
      }
      await this.removeAll(over);
    } catch (error) {
      this.logger.error('Failed to clear resolved ERP export notifications', error as Error);
    }
  }

  private syncErrors(): Promise<Notification[]> {
    return this.repo.findAll({
      where: [{ field: 'type', op: '==', value: NotificationType.SYNC_ERROR }],
    });
  }

  private async removeAll(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      const batch = this.firestore.batch();
      for (const id of ids.slice(i, i + DELETE_BATCH)) batch.delete(this.repo.doc(id));
      await batch.commit();
    }
    this.gateway.broadcastToRoles([Role.ADMIN], 'notification.deleted', { ids });
  }

  @OnEvent(CHAT_HANDOFF_EVENT)
  async handleChatHandoff(payload: ChatHandoffEvent): Promise<void> {
    try {
      const channel = payload.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram';
      await this.create(
        NotificationType.CHAT_HANDOFF,
        `Cliente esperando en ${channel}`,
        `${payload.customerName ?? 'Un cliente'}: ${payload.reason}`,
        [Role.ADMIN],
        { ...payload },
      );
    } catch (error) {
      this.logger.error('Failed to create chat handoff notification', error as Error);
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
