import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PAYMENT_VERIFIED_EVENT, PaymentVerifiedEvent } from '../payments/payments.service';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersEventsListener {
  private readonly logger = new Logger(OrdersEventsListener.name);

  constructor(private readonly ordersService: OrdersService) {}

  @OnEvent(PAYMENT_VERIFIED_EVENT)
  async handlePaymentVerified(payload: PaymentVerifiedEvent) {
    try {
      await this.ordersService.markPaid(payload.orderId);
    } catch (error) {
      this.logger.error(`Failed to mark order ${payload.orderId} as paid`, error as Error);
    }
  }
}
