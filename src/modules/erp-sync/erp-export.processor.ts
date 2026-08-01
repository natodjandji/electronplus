import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { OrdersService } from '../orders/orders.service';
import { PROFIT_PLUS_ADAPTER, ProfitPlusAdapter } from './adapters/profit-plus-adapter.interface';
import { SyncDirection, SyncLog, SyncStatus, syncLogExpiresAt } from './entities/sync-log.entity';
import { ERP_SYNC_ERROR_EVENT, ErpSyncErrorEvent } from './sync.service';

export const ERP_EXPORT_QUEUE = 'erp-export';

export interface ErpExportJobData {
  orderId: string;
}

@Processor(ERP_EXPORT_QUEUE)
export class ErpExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ErpExportProcessor.name);
  private readonly repo: FirestoreRepository<SyncLog>;

  constructor(
    @Inject(PROFIT_PLUS_ADAPTER) private readonly adapter: ProfitPlusAdapter,
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly ordersService: OrdersService,
    private readonly events: EventEmitter2,
  ) {
    super();
    this.repo = new FirestoreRepository<SyncLog>(firestore, Collections.SYNC_LOGS);
  }

  async process(job: Job<ErpExportJobData>): Promise<void> {
    const { orderId } = job.data;
    const log = await this.repo.create({
      direction: SyncDirection.OUTBOUND,
      status: SyncStatus.RUNNING,
      startedAt: new Date(),
      reference: orderId,
      expiresAt: syncLogExpiresAt(),
    });

    try {
      const order = await this.ordersService.findById(orderId);
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
      await this.ordersService.markErpExported(orderId);

      await this.repo.update(log.id, {
        status: SyncStatus.SUCCESS,
        itemsProcessed: order.items.length,
        finishedAt: new Date(),
      });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`ERP export failed for order ${orderId}`, error as Error);
      await this.ordersService.markErpExported(orderId, message);

      await this.repo.update(log.id, {
        status: SyncStatus.ERROR,
        error: message,
        finishedAt: new Date(),
      });
      this.events.emit(ERP_SYNC_ERROR_EVENT, {
        direction: SyncDirection.OUTBOUND,
        message,
        reference: orderId,
      } satisfies ErpSyncErrorEvent);
      throw error; // let BullMQ apply the configured retry/backoff policy
    }
  }
}
