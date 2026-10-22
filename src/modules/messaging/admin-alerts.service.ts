import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, type FirestoreDoc } from '../../firebase/firestore.repository';
import { formatMoney } from '../email/format-money';
import { ERP_SYNC_ERROR_EVENT, type ErpSyncErrorEvent } from '../erp-sync/sync.service';
import { EXPENSE_DUE_ALERT_EVENT, type ExpenseDueAlertEvent } from '../expenses/expenses.service';
import { ExpenseDueStatus } from '../expenses/entities/expense.entity';
import { PayableDueStatus } from '../finance/entities/supplier-payable.entity';
import { INVOICE_DUE_ALERT_EVENT, type InvoiceDueAlertEvent } from '../finance/finance.service';
import { StockAlertLevel } from '../inventory/entities/stock-alert.entity';
import {
  STOCK_ALERT_RAISED_EVENT,
  type StockAlertRaisedEvent,
} from '../inventory/inventory.service';
import { FulfillmentMethod } from '../orders/entities/order.entity';
import {
  ORDER_CREATED_EVENT,
  OrdersService,
  type OrderCreatedEvent,
} from '../orders/orders.service';
import { PAYMENT_METHOD_LABEL } from '../quotes/customer-quote-pdf';
import { REVIEW_CREATED_EVENT, type ReviewCreatedEvent } from '../reviews/reviews.service';
import { CHAT_HANDOFF_EVENT, type ChatHandoffEvent } from './messaging.events';
import { MessagingSettingsService } from './messaging-settings.service';
import {
  ALERT_PARAMS_BUDGET,
  CUSTOMER_WAITING,
  EXPENSE_DUE_SOON,
  EXPENSE_OVERDUE,
  INVOICE_DUE_SOON,
  INVOICE_OVERDUE,
  ORDER_NEW,
  REVIEW_NEW,
  REVIEW_TO_HANDLE,
  STOCK_GROUPED,
  STOCK_LOW,
  STOCK_OUT,
  SYNC_ERROR,
  TEST_ALERT,
} from './meta/alert-templates';
import { ChatChannelsService, templateParam } from './meta/chat-channels.service';
import type { WhatsappTemplate } from './meta/whatsapp-template';
import { ReplyQueueService } from './reply-queue.service';

/** An alert as it reaches WhatsApp: its kind's template (alert-templates.ts)
 * and that template's parameters, in order. */
export interface AdminAlert {
  template: WhatsappTemplate;
  params: string[];
}

export interface AlertDelivery {
  sent: number;
  failed: { phone: string; error: string }[];
}

/** One ERP sync can raise an alert for every product that crossed its
 * threshold. They wait at least this long, and go out together at the end
 * of the window they fall in. */
const STOCK_MIN_WAIT_MS = 60_000;
const STOCK_WINDOW_MS = 2 * 60_000;
/** A Profit Plus error repeats on every sync tick until someone fixes it;
 * the same one goes out at most this often. */
const SYNC_ERROR_COOLDOWN_MS = 6 * 60 * 60 * 1000;

interface PendingStockAlert extends FirestoreDoc {
  sku: string;
  name: string;
  level: StockAlertLevel;
  stock: number;
}

interface AlertCooldown extends FirestoreDoc {
  sentAt: Date;
}

/**
 * The panel's alerts on WhatsApp, to the numbers set in the assistant's
 * settings: the ones admins also get by email (stock, invoices and expenses
 * due, reviews) plus new orders, chats handed to a person and Profit Plus
 * errors. Stock alerts go out grouped. Each handler catches its own errors,
 * like the email and notification listeners, so a failed send never
 * reaches whatever emitted the event.
 */
@Injectable()
export class AdminAlertsService implements OnModuleInit {
  private readonly logger = new Logger(AdminAlertsService.name);
  private readonly pendingStock: FirestoreRepository<PendingStockAlert>;
  private readonly cooldowns: FirestoreRepository<AlertCooldown>;
  /** The grouped send this instance last scheduled, so the rest of a burst
   * doesn't call Cloud Tasks again. */
  private scheduledFlushAt = 0;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly settings: MessagingSettingsService,
    private readonly channels: ChatChannelsService,
    private readonly queue: ReplyQueueService,
    private readonly orders: OrdersService,
  ) {
    this.pendingStock = new FirestoreRepository(firestore, Collections.ADMIN_ALERT_QUEUE);
    this.cooldowns = new FirestoreRepository(firestore, Collections.ADMIN_ALERT_COOLDOWNS);
  }

  onModuleInit(): void {
    this.queue.setAlertFlushRunner(() => this.flushStock());
  }

  /** To every alert number; one that fails doesn't stop the rest. */
  async send(alert: AdminAlert): Promise<AlertDelivery> {
    const delivery: AlertDelivery = { sent: 0, failed: [] };
    const limit = Math.floor(ALERT_PARAMS_BUDGET / Math.max(1, alert.params.length));
    const body = alert.params.map((p) => templateParam(p, limit));
    for (const phone of await this.recipients()) {
      try {
        await this.channels.sendTemplate(phone, alert.template.name, { body });
        delivery.sent++;
      } catch (error) {
        const message = (error as Error).message;
        delivery.failed.push({ phone, error: message });
        this.logger.error(`WhatsApp alert ${alert.template.name} to ${phone} failed: ${message}`);
      }
    }
    return delivery;
  }

  sendTest(): Promise<AlertDelivery> {
    return this.send({ template: TEST_ALERT, params: [] });
  }

  private async recipients(): Promise<string[]> {
    if (!this.channels.isConfigured('whatsapp')) return [];
    return (await this.settings.get()).alertPhones;
  }

  @OnEvent(STOCK_ALERT_RAISED_EVENT)
  async handleStockAlert(payload: StockAlertRaisedEvent): Promise<void> {
    try {
      if ((await this.recipients()).length === 0) return;
      // One doc per product: a second alert for it before the send
      // replaces the first.
      await this.pendingStock.patch(payload.productId, {
        sku: payload.sku,
        name: payload.name,
        level: payload.level,
        stock: payload.stock,
      });
      const at = Math.ceil((Date.now() + STOCK_MIN_WAIT_MS) / STOCK_WINDOW_MS) * STOCK_WINDOW_MS;
      if (at === this.scheduledFlushAt) return;
      this.scheduledFlushAt = at;
      await this.queue.scheduleAlertFlush(new Date(at)).catch((error) => {
        this.scheduledFlushAt = 0;
        throw error;
      });
    } catch (error) {
      this.logger.error(`Failed to queue the stock alert for ${payload.sku}`, error as Error);
    }
  }

  /** Sends the waiting stock alerts as one message. Returns how many it
   * covered. */
  async flushStock(): Promise<number> {
    const pending = await this.pendingStock.findAll();
    if (pending.length === 0) return 0;
    await this.send(stockSummary(pending));
    // Sent or not, they're done: the email and the panel's bell carry them
    // too. A batch takes at most 500 writes.
    for (let i = 0; i < pending.length; i += 500) {
      const batch = this.firestore.batch();
      for (const alert of pending.slice(i, i + 500)) {
        batch.delete(this.pendingStock.doc(alert.id));
      }
      await batch.commit();
    }
    return pending.length;
  }

  @OnEvent(INVOICE_DUE_ALERT_EVENT)
  async handleInvoiceDue(payload: InvoiceDueAlertEvent): Promise<void> {
    await this.safely(`invoice ${payload.invoiceNumber}`, () =>
      this.send({
        template:
          payload.dueStatus === PayableDueStatus.OVERDUE ? INVOICE_OVERDUE : INVOICE_DUE_SOON,
        params: [payload.invoiceNumber, payload.supplierName, payload.dueDate],
      }),
    );
  }

  @OnEvent(EXPENSE_DUE_ALERT_EVENT)
  async handleExpenseDue(payload: ExpenseDueAlertEvent): Promise<void> {
    await this.safely(`expense ${payload.name}`, () =>
      this.send({
        template:
          payload.dueStatus === ExpenseDueStatus.OVERDUE ? EXPENSE_OVERDUE : EXPENSE_DUE_SOON,
        params: [payload.name, payload.dueDate],
      }),
    );
  }

  @OnEvent(REVIEW_CREATED_EVENT)
  async handleReviewCreated(payload: ReviewCreatedEvent): Promise<void> {
    await this.safely('new review', () => this.send(reviewAlert(payload)));
  }

  @OnEvent(CHAT_HANDOFF_EVENT)
  async handleChatHandoff(payload: ChatHandoffEvent): Promise<void> {
    await this.safely(`handoff ${payload.conversationId}`, () =>
      this.send({
        template: CUSTOMER_WAITING,
        params: [
          payload.customerName ?? 'Un cliente',
          payload.reason,
          payload.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram',
        ],
      }),
    );
  }

  @OnEvent(ORDER_CREATED_EVENT)
  async handleOrderCreated(payload: OrderCreatedEvent): Promise<void> {
    await this.safely(`order ${payload.orderId}`, async () => {
      if ((await this.recipients()).length === 0) return;
      const order = await this.orders.findById(payload.orderId);
      const units = order.items.reduce((sum, item) => sum + item.qty, 0);
      const delivery =
        order.fulfillmentMethod === FulfillmentMethod.PICKUP
          ? 'Retiro en tienda'
          : `Envío a ${[order.shippingCity, order.shippingState].filter(Boolean).join(', ') || 'domicilio'}`;
      await this.send({
        template: ORDER_NEW,
        params: [
          [
            order.shippingFullName,
            `${units} ${units === 1 ? 'producto' : 'productos'}`,
            PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod,
            delivery,
          ].join(' · '),
          formatMoney(order.totalAmount),
        ],
      });
    });
  }

  @OnEvent(ERP_SYNC_ERROR_EVENT)
  async handleErpSyncError(payload: ErpSyncErrorEvent): Promise<void> {
    await this.safely('Profit Plus error', async () => {
      if ((await this.recipients()).length === 0) return;
      const key = createHash('sha256').update(payload.message).digest('hex').slice(0, 40);
      const last = await this.cooldowns.findById(key);
      if (last && Date.now() - last.sentAt.getTime() < SYNC_ERROR_COOLDOWN_MS) return;
      await this.cooldowns.patch(key, { sentAt: new Date() });
      await this.send({ template: SYNC_ERROR, params: [payload.message] });
    });
  }

  private async safely(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Failed to send the WhatsApp alert for ${what}`, error as Error);
    }
  }
}

/** The waiting stock alerts as one message: a lone one as itself, several
 * as a list, out of stock first, as many as fit. */
export function stockSummary(
  alerts: Pick<PendingStockAlert, 'sku' | 'name' | 'level' | 'stock'>[],
): AdminAlert {
  if (alerts.length === 1) {
    const [only] = alerts;
    const product = `${only.name} (${only.sku})`;
    return only.level === StockAlertLevel.OUT
      ? { template: STOCK_OUT, params: [product] }
      : { template: STOCK_LOW, params: [String(only.stock), product] };
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');
  const out = alerts.filter((a) => a.level === StockAlertLevel.OUT).sort(byName);
  const low = alerts.filter((a) => a.level !== StockAlertLevel.OUT).sort(byName);
  const lines = [
    ...out.map((a) => `${a.name} (${a.sku}): agotado`),
    ...low.map((a) => `${a.name} (${a.sku}): quedan ${a.stock}`),
  ];
  return {
    template: STOCK_GROUPED,
    params: [fitList(lines, Math.floor(ALERT_PARAMS_BUDGET / 2)), String(alerts.length)],
  };
}

/** "a · b · c", or "a · b · y 3 más" when they don't all fit in `max`. */
function fitList(items: string[], max: number): string {
  const text = (shown: number) => {
    const rest = items.length - shown;
    return items.slice(0, shown).join(' · ') + (rest > 0 ? ` · y ${rest} más` : '');
  };
  let shown = items.length;
  while (shown > 1 && text(shown).length > max) shown--;
  return text(shown);
}

function reviewAlert(review: ReviewCreatedEvent): AdminAlert {
  const who = review.customerName
    ? `${review.customerName}${review.customerPhone ? ` (${review.customerPhone})` : ''}`
    : 'Un cliente sin nombre';
  const comment = [
    review.message ? `"${review.message}"` : 'Sin comentario',
    review.sellerName && `Atendió ${review.sellerName}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    template: review.rating <= 2 ? REVIEW_TO_HANDLE : REVIEW_NEW,
    params: [comment, who, String(review.rating)],
  };
}
