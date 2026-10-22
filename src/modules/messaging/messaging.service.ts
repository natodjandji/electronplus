import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EnvConfig } from '../../config/env.validation';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import type { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { ShippingRatesService } from '../shipping-rates/shipping-rates.service';
import { SalesAgentService, type CustomerImage } from './agent/sales-agent.service';
import {
  availability,
  formatBs,
  formatRef,
  productUrl,
  type SalesToolDeps,
} from './agent/sales-tools';
import { ChatStoreService } from './chat-store.service';
import type {
  ChatChannel,
  ChatConversation,
  ChatMessage,
  MessagingSettings,
} from './entities/chat.entity';
import { ChatChannelsService } from './meta/chat-channels.service';
import { isValidMetaSignature, parseWebhook } from './meta/webhook-events';
import { CHAT_HANDOFF_EVENT, type ChatHandoffEvent } from './messaging.events';
import { MessagingSettingsService } from './messaging-settings.service';
import { ChatBusyError, ReplyQueueService, type ReplyJob } from './reply-queue.service';

/** Longer than a reply can take (the task's deadline is 300 s), so a run
 * that died holding the chat frees it on its own. */
const LOCK_MS = 5 * 60 * 1000;
/** After a handoff the assistant waits this long for a person, unless an
 * admin resumes it sooner. A person replying sets the usual human pause. */
const HANDOFF_PAUSE_HOURS = 48;
const MANUAL_PAUSE_DAYS = 365;
const FALLBACK_TEXT =
  'Disculpe, en este momento no puedo responderle. Una persona de la tienda le escribirá por aquí en breve.';

export type ReplyOutcome =
  'missing' | 'superseded' | 'disabled' | 'paused' | 'nothing' | 'replied' | 'failed';

/**
 * The WhatsApp and Instagram sales assistant. The webhook stores each
 * customer message and schedules a reply a few seconds out; the reply run
 * answers everything the customer sent since the last answer, unless a
 * person of the store is handling that chat.
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly store: ChatStoreService,
    private readonly settings: MessagingSettingsService,
    private readonly channels: ChatChannelsService,
    private readonly agent: SalesAgentService,
    private readonly queue: ReplyQueueService,
    private readonly products: ProductsService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly shipping: ShippingRatesService,
    private readonly exchangeRate: ExchangeRateService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.queue.setInlineRunner((job) => this.processReply(job));
  }

  /** Meta's subscription check: echo the challenge when the token matches. */
  verifySubscription(mode?: string, token?: string, challenge?: string): string | null {
    const expected = this.config.get('META_WEBHOOK_VERIFY_TOKEN', { infer: true });
    return mode === 'subscribe' && expected && token === expected && challenge ? challenge : null;
  }

  isAuthentic(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const secret = this.config.get('META_APP_SECRET', { infer: true });
    return Boolean(secret) && isValidMetaSignature(rawBody, signature, secret!);
  }

  async handleWebhook(body: unknown): Promise<{ inbound: number; echoes: number }> {
    const { inbound, echoes } = parseWebhook(body);
    const settings = await this.settings.get();
    const appId = this.config.get('META_APP_ID', { infer: true });

    let paused = 0;
    for (const echo of echoes) {
      // Instagram echoes our own sends too; they carry our app's id.
      if (echo.channel === 'instagram' && (!appId || echo.appId === appId)) continue;
      if (await this.store.recordHumanEcho(echo, settings.humanPauseHours)) paused++;
    }

    let stored = 0;
    for (const message of inbound) {
      // The store's own alert numbers aren't customers: no chat, no reply.
      if (message.channel === 'whatsapp' && settings.alertPhones.includes(message.customerId)) {
        continue;
      }
      const { conversationId, isNew } = await this.store.recordInbound(message);
      if (!isNew) continue;
      stored++;
      if (this.canReply(message.channel, settings)) {
        await this.queue.schedule({ conversationId, triggerId: message.externalId });
      }
    }
    return { inbound: stored, echoes: paused };
  }

  private canReply(channel: ChatChannel, settings: MessagingSettings): boolean {
    const channelOn = channel === 'whatsapp' ? settings.whatsappEnabled : settings.instagramEnabled;
    return (
      settings.botEnabled &&
      channelOn &&
      this.channels.isConfigured(channel) &&
      this.agent.isConfigured()
    );
  }

  /** One scheduled reply. Throws ChatBusyError while another run holds the
   * chat, so the queue tries again once it's done. */
  async processReply(job: ReplyJob): Promise<ReplyOutcome> {
    const conversation = await this.store.findConversation(job.conversationId);
    if (!conversation) return 'missing';
    // A newer message scheduled its own run, which answers this one too.
    if (conversation.lastInboundId !== job.triggerId) return 'superseded';
    const settings = await this.settings.get();
    if (!this.canReply(conversation.channel, settings)) return 'disabled';
    if (ChatStoreService.isPaused(conversation)) return 'paused';

    if (!(await this.store.tryLock(conversation.id, LOCK_MS))) throw new ChatBusyError();
    try {
      return await this.answer(conversation, settings);
    } finally {
      await this.store.unlock(conversation.id);
    }
  }

  private async answer(
    conversation: ChatConversation,
    settings: MessagingSettings,
  ): Promise<ReplyOutcome> {
    const history = await this.store.history(conversation.id);
    const { earlier, pending } = splitPending(history);
    if (pending.length === 0) return 'nothing';

    await this.channels.showTyping(
      conversation.channel,
      conversation.customerId,
      conversation.lastInboundId!,
    );
    const customerName = await this.customerName(conversation);
    const images = await this.loadImages(pending);

    let sent = false;
    try {
      const result = await this.agent.reply({
        channel: conversation.channel,
        customerName,
        // The messages being answered go last, even when one arrived while
        // an earlier reply was being written.
        history: [...earlier, ...pending],
        images,
        settings,
        now: new Date(),
        tools: this.toolDeps(conversation),
        sendText: async (text) => {
          await this.sendText(conversation, text);
          sent = true;
        },
      });
      this.logger.log(
        `Reply in ${conversation.id}: ${result.stopReason}, tokens in ${result.usage.input} (cache ${result.usage.cacheRead} read, ${result.usage.cacheWrite} written), out ${result.usage.output}`,
      );
      if (!result.repliedWithText && !result.handedOver && result.stopReason === 'refusal') {
        await this.fallBack(conversation, 'El asistente no quiso responder este mensaje.');
      }
    } catch (error) {
      this.logger.error(`Reply in ${conversation.id} failed`, error as Error);
      if (!sent)
        await this.fallBack(conversation, `Error del asistente: ${(error as Error).message}`);
      await this.store.markAnswered(
        conversation.id,
        pending.map((m) => m.id),
      );
      return 'failed';
    }
    await this.store.markAnswered(
      conversation.id,
      pending.map((m) => m.id),
    );
    return 'replied';
  }

  private async customerName(conversation: ChatConversation): Promise<string | null> {
    if (conversation.customerName) return conversation.customerName;
    if (conversation.channel !== 'instagram') return null;
    const name = await this.channels.instagramName(conversation.customerId);
    if (name) await this.store.setCustomerName(conversation.id, name);
    return name ?? null;
  }

  private async loadImages(messages: ChatMessage[]): Promise<Map<string, CustomerImage>> {
    const images = new Map<string, CustomerImage>();
    for (const message of messages) {
      if (message.kind !== 'image' || !message.media) continue;
      try {
        const image = await this.channels.loadImage(message.media);
        if (image) images.set(message.id, image);
      } catch (error) {
        this.logger.warn(`Couldn't load a customer photo: ${(error as Error).message}`);
      }
    }
    return images;
  }

  private toolDeps(conversation: ChatConversation): SalesToolDeps {
    return {
      catalog: () => this.products.activeCatalog(),
      paymentMethods: async () =>
        (await this.paymentMethods.list())
          .filter((m) => m.enabled)
          .map((m) => ({ label: m.label, details: m.details })),
      bcvRate: () => this.bcvRate(),
      shippingQuote: (state, city) => this.shipping.quote(state, city),
      siteUrl: this.config.get('PUBLIC_SITE_URL', { infer: true }),
      sendProducts: (products) => this.sendProducts(conversation, products),
      handOver: (reason, summary) => this.handOver(conversation, reason, summary),
    };
  }

  private bcvRate(): Promise<{ rate: number; date: string } | null> {
    return this.exchangeRate
      .getBcvRate()
      .then((r) => ({ rate: r.rate, date: r.date }))
      .catch(() => null);
  }

  private async sendText(conversation: ChatConversation, text: string): Promise<void> {
    const ids = await this.channels.sendText(conversation.channel, conversation.customerId, text);
    await this.store.recordOutbound(conversation.id, {
      author: 'bot',
      kind: 'text',
      text,
      externalIds: ids,
    });
  }

  private async sendProducts(conversation: ChatConversation, products: Product[]): Promise<void> {
    const rate = await this.bcvRate();
    const siteUrl = this.config.get('PUBLIC_SITE_URL', { infer: true });
    const cards = products.map((p) => ({
      title: p.name,
      details: [
        `${formatRef(p.retailPrice)} + IVA${rate ? ` (≈ ${formatBs(p.retailPrice * rate.rate)})` : ''}`,
        [availability(p.stock), p.brand].filter(Boolean).join(' · '),
      ].join('\n'),
      imageUrl: p.imageUrl,
      url: productUrl(siteUrl, p.id),
    }));
    const ids = await this.channels.sendProducts(
      conversation.channel,
      conversation.customerId,
      cards,
    );
    await this.store.recordOutbound(conversation.id, {
      author: 'bot',
      kind: 'products',
      text: products.map((p) => p.name).join(', '),
      externalIds: ids,
      products: products.map((p) => ({ id: p.id, name: p.name, price: p.retailPrice })),
    });
  }

  private async handOver(
    conversation: ChatConversation,
    reason: string,
    summary: string,
  ): Promise<void> {
    await this.store.pause(
      conversation.id,
      new Date(Date.now() + HANDOFF_PAUSE_HOURS * 60 * 60 * 1000),
      'handoff',
      `${reason}\n${summary}`,
    );
    const event: ChatHandoffEvent = {
      conversationId: conversation.id,
      channel: conversation.channel,
      customerName: conversation.customerName ?? null,
      reason,
      summary,
    };
    this.events.emit(CHAT_HANDOFF_EVENT, event);
  }

  /** The assistant failed: tell the customer a person will follow up, and
   * hand the chat over so one does. */
  private async fallBack(conversation: ChatConversation, reason: string): Promise<void> {
    try {
      await this.sendText(conversation, FALLBACK_TEXT);
    } catch (error) {
      this.logger.error(`Fallback message in ${conversation.id} failed`, error as Error);
    }
    await this.handOver(conversation, reason, 'Revisar la conversación y responder al cliente.');
  }

  // --- Admin ---

  listConversations(): Promise<ChatConversation[]> {
    return this.store.listRecent();
  }

  async conversationMessages(id: string): Promise<ChatMessage[]> {
    return (await this.store.history(id, 200)).map((m) => ({ ...m, media: undefined }));
  }

  /** Pauses the assistant in a chat until an admin resumes it, or resumes it. */
  async setPaused(id: string, paused: boolean): Promise<void> {
    if (paused) {
      await this.store.pause(
        id,
        new Date(Date.now() + MANUAL_PAUSE_DAYS * 24 * 60 * 60 * 1000),
        'manual',
      );
    } else {
      await this.store.resume(id);
    }
  }

  async setNoticesOff(id: string, off: boolean): Promise<void> {
    await this.store.setNoticesOff(id, off);
  }

  getSettings(): Promise<MessagingSettings> {
    return this.settings.get();
  }

  updateSettings(changes: Partial<MessagingSettings>): Promise<MessagingSettings> {
    return this.settings.update(changes);
  }

  /** What's set up, for the admin screen: which channels can answer. */
  status() {
    return {
      assistant: this.agent.isConfigured(),
      whatsapp: this.channels.isConfigured('whatsapp'),
      instagram: this.channels.isConfigured('instagram'),
      webhook: Boolean(
        this.config.get('META_APP_SECRET', { infer: true }) &&
        this.config.get('META_WEBHOOK_VERIFY_TOKEN', { infer: true }),
      ),
    };
  }
}

/** The customer messages still waiting for an answer — those after the
 * last thing a person of the store said (they answered what came before)
 * that no reply has covered yet — and everything else. */
export function splitPending(history: ChatMessage[]): {
  earlier: ChatMessage[];
  pending: ChatMessage[];
} {
  let lastHuman = -1;
  history.forEach((m, i) => {
    if (m.author === 'human') lastHuman = i;
  });
  const pending: ChatMessage[] = [];
  const earlier: ChatMessage[] = [];
  history.forEach((m, i) => {
    if (i > lastHuman && m.author === 'customer' && !m.answered) pending.push(m);
    else earlier.push(m);
  });
  return { earlier, pending };
}
