import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_PAID_EVENT, OrderPaidEvent } from '../orders/orders.service';
import { ErpExportService } from './erp-export.service';

@Injectable()
export class ErpSyncEventsListener {
  private readonly logger = new Logger(ErpSyncEventsListener.name);

  constructor(private readonly erpExport: ErpExportService) {}

  /** First attempt at reporting the sale, right after payment. If it fails
   * or the instance stalls, the order is still flagged pending (markPaid
   * sets it) and the erp-sync cron retries it. */
  @OnEvent(ORDER_PAID_EVENT)
  async handleOrderPaid(payload: OrderPaidEvent) {
    try {
      await this.erpExport.exportOrder(payload.orderId);
    } catch (error) {
      this.logger.error(`ERP export attempt failed for order ${payload.orderId}`, error as Error);
    }
  }
}
