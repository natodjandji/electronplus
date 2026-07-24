import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { ORDER_PAID_EVENT, OrderPaidEvent } from '../orders/orders.service';
import { ERP_EXPORT_QUEUE, ErpExportJobData } from './erp-export.processor';

@Injectable()
export class ErpSyncEventsListener {
  private readonly logger = new Logger(ErpSyncEventsListener.name);

  constructor(@InjectQueue(ERP_EXPORT_QUEUE) private readonly exportQueue: Queue<ErpExportJobData>) {}

  @OnEvent(ORDER_PAID_EVENT)
  async handleOrderPaid(payload: OrderPaidEvent) {
    try {
      await this.exportQueue.add(
        'report-sale',
        { orderId: payload.orderId },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (error) {
      this.logger.error(`Failed to queue ERP export for order ${payload.orderId}`, error as Error);
    }
  }
}
