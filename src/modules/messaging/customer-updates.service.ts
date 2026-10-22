import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { formatMoney } from '../email/format-money';
import type { Order } from '../orders/entities/order.entity';
import {
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
  OrdersService,
  type OrderCreatedEvent,
  type OrderStatusChangedEvent,
} from '../orders/orders.service';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import {
  QUOTE_STATUS_CHANGED_EVENT,
  QuotesService,
  type QuoteStatusChangedEvent,
} from '../quotes/quotes.service';
import { UsersService } from '../users/users.service';
import { ChatStoreService } from './chat-store.service';
import { conversationId } from './entities/chat.entity';
import { MessagingSettingsService } from './messaging-settings.service';
import { ChatChannelsService, templateParam } from './meta/chat-channels.service';
import {
  ORDER_RECEIVED,
  ORDER_STATUS_TEMPLATES,
  QUOTE_APPROVED,
  QUOTE_REJECTED,
} from './meta/customer-templates';
import { renderTemplate, type WhatsappTemplate } from './meta/whatsapp-template';

const PARAM_LIMIT = 60;

/**
 * Order and quote updates on WhatsApp for customers who agreed at checkout:
 * the moments the customer emails cover (EmailListener), minus "en
 * preparación". Off until an admin turns customerUpdatesEnabled on. Each
 * message also goes into the customer's chat. Handlers catch their own
 * errors, like the email listener, so a failed send never reaches whatever
 * emitted the event.
 */
@Injectable()
export class CustomerUpdatesService {
  private readonly logger = new Logger(CustomerUpdatesService.name);

  constructor(
    private readonly settings: MessagingSettingsService,
    private readonly channels: ChatChannelsService,
    private readonly store: ChatStoreService,
    private readonly orders: OrdersService,
    private readonly quotes: QuotesService,
    private readonly users: UsersService,
  ) {}

  @OnEvent(ORDER_CREATED_EVENT)
  async handleOrderCreated(payload: OrderCreatedEvent): Promise<void> {
    await this.safely(`order ${payload.orderId}`, async () => {
      if (!(await this.enabled())) return;
      const order = await this.orders.findById(payload.orderId);
      await this.sendForOrder(order, ORDER_RECEIVED, [formatMoney(order.totalAmount)]);
    });
  }

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async handleOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    const template = ORDER_STATUS_TEMPLATES[payload.status];
    if (!template) return;
    await this.safely(`order ${payload.orderId}`, async () => {
      if (!(await this.enabled())) return;
      await this.sendForOrder(await this.orders.findById(payload.orderId), template);
    });
  }

  /** A quote has no phone of its own: it goes to the one on the customer's
   * profile, if they agreed at a checkout. */
  @OnEvent(QUOTE_STATUS_CHANGED_EVENT)
  async handleQuoteStatusChanged(payload: QuoteStatusChangedEvent): Promise<void> {
    await this.safely(`quote ${payload.quoteId}`, async () => {
      if (!(await this.enabled())) return;
      const quote = await this.quotes.findById(payload.quoteId);
      const user = await this.users.findById(quote.userId);
      const to = user.whatsappUpdates ? whatsappNumber(user.phone) : null;
      if (!to) return;
      const approved = payload.status === QuoteStatus.APPROVED;
      const name = quote.customerName || user.displayName || '';
      await this.send(to, approved ? QUOTE_APPROVED : QUOTE_REJECTED, {
        body: [firstName(name), shortRef(quote.id)],
        button: approved ? quote.id : undefined,
        customerName: name,
      });
    });
  }

  private async enabled(): Promise<boolean> {
    return (
      this.channels.isConfigured('whatsapp') && (await this.settings.get()).customerUpdatesEnabled
    );
  }

  private async sendForOrder(
    order: Order,
    template: WhatsappTemplate,
    extra: string[] = [],
  ): Promise<void> {
    const to = order.whatsappUpdates ? whatsappNumber(order.shippingPhone) : null;
    if (!to) return;
    await this.send(to, template, {
      body: [firstName(order.shippingFullName), shortRef(order.id), ...extra],
      customerName: order.shippingFullName,
    });
  }

  private async send(
    to: string,
    template: WhatsappTemplate,
    message: { body: string[]; button?: string; customerName?: string },
  ): Promise<void> {
    // They asked in the chat to stop getting these.
    if ((await this.store.findConversation(conversationId('whatsapp', to)))?.noticesOff) return;
    const body = message.body.map((p) => templateParam(p, PARAM_LIMIT));
    const externalId = await this.channels.sendTemplate(to, template.name, {
      body,
      button: message.button,
    });
    await this.store.recordNotice({
      channel: 'whatsapp',
      customerId: to,
      customerName: message.customerName,
      text: renderTemplate(template, body),
      externalId,
    });
  }

  private async safely(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Failed to send the WhatsApp update for ${what}`, error as Error);
    }
  }
}

/** A Venezuelan mobile as WhatsApp addresses it ("0414-1234567" →
 * "584141234567"). Null for a landline or anything else: those can't get
 * WhatsApp messages. */
export function whatsappNumber(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const local = digits.startsWith('58') ? digits.slice(2) : digits.replace(/^0/, '');
  return /^4\d{9}$/.test(local) ? `58${local}` : null;
}

/** How the web shows an order or quote to its customer: #A1B2C3D4. */
function shortRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'cliente';
}
