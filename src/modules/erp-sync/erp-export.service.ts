import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, snapshotToEntity } from '../../firebase/firestore.repository';
import { Order } from '../orders/entities/order.entity';
import { PROFIT_PLUS_ADAPTER, ProfitPlusAdapter } from './adapters/profit-plus-adapter.interface';
import { SyncDirection, SyncLog, SyncStatus, syncLogExpiresAt } from './entities/sync-log.entity';
import { ERP_SYNC_ERROR_EVENT, ErpSyncErrorEvent } from './sync.service';

/** Attempts per sale before it is left for a person to look at. */
export const ERP_EXPORT_MAX_ATTEMPTS = 5;

/** Attempts per cron tick, so one run stays well inside the request timeout. */
export const ERP_EXPORT_MAX_PER_RUN = 50;

/** How long one attempt holds an order. Long enough for a bridge call; short
 * enough that an instance stalled mid-attempt doesn't block the order past
 * the next cron tick. */
const CLAIM_MS = 5 * 60_000;

/** Wait after the n-th failed attempt: 15, 30, 60, 120 minutes. The
 * erp-sync cron runs every 15 minutes, so that is the finest step. */
export function nextAttemptDelayMs(attempts: number): number {
  return 15 * 60_000 * 2 ** (attempts - 1);
}

export type ErpExportResult = 'exported' | 'failed' | 'skipped';

/**
 * Reports paid sales to the principal store's Profit Plus. The order itself
 * carries the pending flag, set by OrdersService.markPaid in the same write
 * that marks it paid, so a sale can't be lost between "paid" and "pending".
 * The order.paid listener makes the first attempt right away; the erp-sync
 * cron (Cloud Scheduler, every 15 minutes) retries whatever is still pending.
 */
@Injectable()
export class ErpExportService {
  private readonly logger = new Logger(ErpExportService.name);
  private readonly orders: FirestoreRepository<Order>;
  private readonly logs: FirestoreRepository<SyncLog>;

  constructor(
    @Inject(PROFIT_PLUS_ADAPTER) private readonly adapter: ProfitPlusAdapter,
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly events: EventEmitter2,
  ) {
    this.orders = new FirestoreRepository<Order>(firestore, Collections.ORDERS);
    this.logs = new FirestoreRepository<SyncLog>(firestore, Collections.SYNC_LOGS);
  }

  /** Retries every pending sale whose wait is over, up to
   * ERP_EXPORT_MAX_PER_RUN per tick. Reads only pending orders (normally
   * none), and all of them, so orders still waiting can't crowd out the
   * ones that are due. */
  async exportPending(
    now = new Date(),
  ): Promise<{ exported: number; failed: number; waiting: number }> {
    const pending = await this.orders.findAll({
      where: [{ field: 'erpExportPending', op: '==', value: true }],
    });
    const tally = { exported: 0, failed: 0, waiting: 0 };
    let attempted = 0;
    for (const order of pending) {
      const due = !order.erpExportNextAttemptAt || order.erpExportNextAttemptAt <= now;
      if (!due || attempted >= ERP_EXPORT_MAX_PER_RUN) {
        tally.waiting++;
        continue;
      }
      attempted++;
      const result = await this.exportOrder(order.id);
      if (result === 'exported') tally.exported++;
      else if (result === 'failed') tally.failed++;
      else tally.waiting++;
    }
    return tally;
  }

  /** One attempt at reporting a paid order. Safe to run from the listener
   * and the cron at once: only the caller that claims the order reports it. */
  async exportOrder(orderId: string): Promise<ErpExportResult> {
    const claimedUntil = await this.claim(orderId);
    if (!claimedUntil) return 'skipped';

    const log = await this.logs.create({
      direction: SyncDirection.OUTBOUND,
      status: SyncStatus.RUNNING,
      startedAt: new Date(),
      reference: orderId,
      expiresAt: syncLogExpiresAt(),
    });

    let order: Order | undefined;
    try {
      order = await this.orders.getOrThrow(orderId, 'Order not found');
      // Cloud Run throttles CPU between requests, so an attempt can stall
      // and wake up after its claim lapsed and another run took the order
      // over. Never report the same sale twice.
      if (Date.now() > claimedUntil.getTime()) {
        await this.logs.update(log.id, {
          status: SyncStatus.ERROR,
          error: 'Claim expired before the sale was reported; left to the next run',
          finishedAt: new Date(),
        });
        return 'skipped';
      }

      await this.adapter.reportSale({
        orderId: order.id,
        customerTaxId: order.shippingTaxId,
        items: order.items.map((item) => ({
          sku: item.sku,
          qty: item.qty,
          unitPrice: item.unitPrice,
        })),
        total: order.totalAmount,
        soldAt: order.createdAt,
      });

      await this.orders.update(orderId, {
        erpExportPending: false,
        erpExportedAt: new Date(),
        erpExportError: FieldValue.delete() as never,
        erpExportNextAttemptAt: null,
        erpExportClaimedUntil: null,
      });
      await this.logs.update(log.id, {
        status: SyncStatus.SUCCESS,
        itemsProcessed: order.items.length,
        finishedAt: new Date(),
      });
      return 'exported';
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`ERP export failed for order ${orderId}`, error as Error);

      if (order) {
        const attempts = (order.erpExportAttempts ?? 0) + 1;
        const giveUp = attempts >= ERP_EXPORT_MAX_ATTEMPTS;
        await this.orders.update(orderId, {
          erpExportAttempts: attempts,
          erpExportError: message,
          erpExportPending: !giveUp,
          erpExportNextAttemptAt: giveUp
            ? null
            : new Date(Date.now() + nextAttemptDelayMs(attempts)),
          erpExportClaimedUntil: null,
        });
      }
      await this.logs.update(log.id, {
        status: SyncStatus.ERROR,
        error: message,
        finishedAt: new Date(),
      });
      this.events.emit(ERP_SYNC_ERROR_EVENT, {
        direction: SyncDirection.OUTBOUND,
        message,
        reference: orderId,
      } satisfies ErpSyncErrorEvent);
      return 'failed';
    }
  }

  /** Takes the order for one attempt, or returns null when it isn't pending
   * or another attempt holds it. */
  private claim(orderId: string): Promise<Date | null> {
    const ref = this.orders.doc(orderId);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const order = snapshotToEntity<Order>(snap);
      if (!order.erpExportPending) return null;
      if (order.erpExportClaimedUntil && order.erpExportClaimedUntil.getTime() > Date.now()) {
        return null;
      }
      const until = new Date(Date.now() + CLAIM_MS);
      tx.update(ref, { erpExportClaimedUntil: until });
      return until;
    });
  }
}
