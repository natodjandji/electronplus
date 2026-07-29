import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { EnvConfig } from '../../config/env.validation';
import { USER_CREATED_EVENT, UserCreatedEvent } from '../../common/guards/firebase-auth.guard';
import {
  ORDER_CREATED_EVENT,
  OrderCreatedEvent,
  ORDER_STATUS_CHANGED_EVENT,
  OrderStatusChangedEvent,
} from '../orders/orders.service';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { orderCreatedEmail } from './templates/order-created-email';
import { orderStatusEmail } from './templates/order-status-email';
import { welcomeEmail } from './templates/welcome-email';

/** One listener per lifecycle email (welcome, order received, fulfillment
 * updates) — each wrapped in try/catch so a failed send (or a lookup that
 * 404s, e.g. a since-deleted order) never bubbles up and disrupts whatever
 * emitted the event. Mirrors OrdersEventsListener / NotificationsService's
 * existing @OnEvent handlers. */
@Injectable()
export class EmailListener {
  private readonly logger = new Logger(EmailListener.name);
  private readonly siteUrl: string;

  constructor(
    private readonly email: EmailService,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true });
  }

  @OnEvent(USER_CREATED_EVENT)
  async handleUserCreated(payload: UserCreatedEvent): Promise<void> {
    try {
      const { subject, html } = welcomeEmail(payload.displayName, this.siteUrl);
      await this.email.send(payload.email, subject, html);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${payload.email}`, error as Error);
    }
  }

  @OnEvent(ORDER_CREATED_EVENT)
  async handleOrderCreated(payload: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.ordersService.findById(payload.orderId);
      const user = await this.usersService.findById(order.userId);
      if (!user.email) return;
      const { subject, html } = orderCreatedEmail(order, this.siteUrl);
      await this.email.send(user.email, subject, html);
    } catch (error) {
      this.logger.error(
        `Failed to send order-created email for order ${payload.orderId}`,
        error as Error,
      );
    }
  }

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async handleOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    try {
      const content = orderStatusEmail(payload.status, this.siteUrl);
      if (!content) return; // no customer-facing copy for this status
      const order = await this.ordersService.findById(payload.orderId);
      const user = await this.usersService.findById(order.userId);
      if (!user.email) return;
      await this.email.send(user.email, content.subject, content.html);
    } catch (error) {
      this.logger.error(`Failed to send status email for order ${payload.orderId}`, error as Error);
    }
  }
}
