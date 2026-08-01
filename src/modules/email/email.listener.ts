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
import {
  QUOTE_STATUS_CHANGED_EVENT,
  QuoteStatusChangedEvent,
  QuotesService,
} from '../quotes/quotes.service';
import { STOCK_ALERT_RAISED_EVENT, StockAlertRaisedEvent } from '../inventory/inventory.service';
import { INVOICE_DUE_ALERT_EVENT, InvoiceDueAlertEvent } from '../finance/finance.service';
import { EXPENSE_DUE_ALERT_EVENT, ExpenseDueAlertEvent } from '../expenses/expenses.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { expenseDueEmail } from './templates/expense-due-email';
import { invoiceDueEmail } from './templates/invoice-due-email';
import { orderCreatedEmail } from './templates/order-created-email';
import { orderStatusEmail } from './templates/order-status-email';
import { quoteStatusEmail } from './templates/quote-status-email';
import { stockAlertEmail } from './templates/stock-alert-email';
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
    private readonly quotesService: QuotesService,
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

  @OnEvent(QUOTE_STATUS_CHANGED_EVENT)
  async handleQuoteStatusChanged(payload: QuoteStatusChangedEvent): Promise<void> {
    try {
      const quote = await this.quotesService.findById(payload.quoteId);
      const content = quoteStatusEmail(quote, this.siteUrl);
      if (!content) return;
      const user = await this.usersService.findById(quote.userId);
      if (!user.email) return;
      await this.email.send(user.email, content.subject, content.html);
    } catch (error) {
      this.logger.error(`Failed to send status email for quote ${payload.quoteId}`, error as Error);
    }
  }

  // --- Operational alerts (stock/invoices/expenses) — admin-only, never
  // the warehouse operator role even though the in-app notification for
  // stock alerts also reaches them (NotificationsService.handleStockAlert).
  // Email is more disruptive than the bell, so it's scoped tighter.

  private async emailEveryAdmin(subject: string, html: string): Promise<void> {
    const admins = await this.usersService.findAdmins();
    await Promise.all(
      admins.filter((a) => a.email).map((a) => this.email.send(a.email, subject, html)),
    );
  }

  @OnEvent(STOCK_ALERT_RAISED_EVENT)
  async handleStockAlertEmail(payload: StockAlertRaisedEvent): Promise<void> {
    try {
      const { subject, html } = stockAlertEmail(payload, this.siteUrl);
      await this.emailEveryAdmin(subject, html);
    } catch (error) {
      this.logger.error(`Failed to send stock alert email for ${payload.sku}`, error as Error);
    }
  }

  @OnEvent(INVOICE_DUE_ALERT_EVENT)
  async handleInvoiceDueEmail(payload: InvoiceDueAlertEvent): Promise<void> {
    try {
      const { subject, html } = invoiceDueEmail(payload, this.siteUrl);
      await this.emailEveryAdmin(subject, html);
    } catch (error) {
      this.logger.error(
        `Failed to send invoice due email for ${payload.invoiceNumber}`,
        error as Error,
      );
    }
  }

  @OnEvent(EXPENSE_DUE_ALERT_EVENT)
  async handleExpenseDueEmail(payload: ExpenseDueAlertEvent): Promise<void> {
    try {
      const { subject, html } = expenseDueEmail(payload, this.siteUrl);
      await this.emailEveryAdmin(subject, html);
    } catch (error) {
      this.logger.error(`Failed to send expense due email for ${payload.name}`, error as Error);
    }
  }
}
