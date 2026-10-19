import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '../orders/entities/order.entity';
import { ORDER_STATUS_CHANGED_EVENT, OrderStatusChangedEvent } from '../orders/orders.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsEventsListener {
  private readonly logger = new Logger(PaymentsEventsListener.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /** A cancelled order mustn't leave its buyer's Cashea order standing. */
  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async handleOrderStatusChanged(payload: OrderStatusChangedEvent) {
    if (payload.status !== OrderStatus.CANCELLED) return;
    try {
      await this.paymentsService.casheaOrderCancelled(payload.orderId);
    } catch (error) {
      this.logger.error(
        `Failed to close the Cashea payment of cancelled order ${payload.orderId}`,
        error as Error,
      );
    }
  }
}
