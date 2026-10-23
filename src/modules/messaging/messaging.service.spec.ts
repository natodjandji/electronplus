import { EventEmitter2 } from '@nestjs/event-emitter';
import { storeDay } from '../../common/utils/store-day';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import type { SalesTurnInput } from './agent/sales-agent.service';
import { ChatStoreService } from './chat-store.service';
import { ChatUsageService, hourKey } from './chat-usage.service';
import type { ChatMessage, DailyChatUsage } from './entities/chat.entity';
import { CHAT_HANDOFF_EVENT } from './messaging.events';
import { MessagingSettingsService } from './messaging-settings.service';
import { MessagingService, splitPending } from './messaging.service';
import { ChatBusyError } from './reply-queue.service';

const whatsappText = (id: string, body: string, from = '584141234567') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba',
      changes: [
        {
          field: 'messages',
          value: {
            contacts: [{ profile: { name: 'Ana' }, wa_id: from }],
            messages: [
              {
                from,
                id,
                timestamp: String(1760000000 + Number(id.replace(/\D/g, '') || 0)),
                type: 'text',
                text: { body },
              },
            ],
          },
        },
      ],
    },
  ],
});

const whatsappImage = (id: string, mediaId: string) => {
  const payload = whatsappText(id, '');
  const message = payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>;
  delete message.text;
  message.type = 'image';
  message.image = { id: mediaId, mime_type: 'image/jpeg' };
  return payload;
};

const CONVERSATION = 'whatsapp_584141234567';

function setup(settings: Record<string, unknown> = { botEnabled: true }) {
  const firestore = new FakeFirestore();
  firestore.seed(Collections.SETTINGS, 'messaging', settings);
  const store = new ChatStoreService(firestore as never);
  const scheduled: { conversationId: string; triggerId: string }[] = [];
  const queue = {
    schedule: jest.fn(async (job) => void scheduled.push(job)),
    setInlineRunner: jest.fn(),
  };
  const sentTexts: string[] = [];
  const channels = {
    isConfigured: () => true,
    sendText: jest.fn(async (_c: string, _to: string, text: string) => {
      sentTexts.push(text);
      return [`out-${sentTexts.length}`];
    }),
    sendProducts: jest.fn(async () => ['cards-1']),
    showTyping: jest.fn(async () => {}),
    loadImage: jest.fn(async () => null),
    instagramName: jest.fn(async () => undefined),
  };
  const agentCalls: SalesTurnInput[] = [];
  const agent = {
    isConfigured: () => true,
    reply: jest.fn(async (input: SalesTurnInput) => {
      agentCalls.push(input);
      if (input.usage) {
        input.usage.input += 1000;
        input.usage.output += 100;
      }
      await input.sendText('¡Hola! ¿En qué le ayudo?');
      return {
        repliedWithText: true,
        handedOver: false,
        stopReason: 'end_turn',
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      };
    }),
  };
  const events = new EventEmitter2();
  const config = {
    get: (key: string) =>
      ({
        META_APP_ID: 'our-app',
        PUBLIC_SITE_URL: 'https://electronplus.com.ve',
        META_WEBHOOK_VERIFY_TOKEN: 'tok',
      })[key],
  };
  const service = new MessagingService(
    store,
    new MessagingSettingsService(firestore as never),
    channels as never,
    agent as never,
    queue as never,
    { activeCatalog: async () => [] } as never,
    { list: async () => [] } as never,
    { quote: async () => ({ amount: 0, matched: false }) } as never,
    { getBcvRate: async () => ({ rate: 200, date: '2026-10-20' }) } as never,
    config as never,
    events,
    new ChatUsageService(firestore as never),
  );
  const messages = async () =>
    (
      await firestore.collection(`${Collections.CHAT_CONVERSATIONS}/${CONVERSATION}/messages`).get()
    ).docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as ChatMessage);
  return {
    firestore,
    service,
    scheduled,
    channels,
    agent,
    agentCalls,
    sentTexts,
    events,
    messages,
    store,
  };
}

describe('MessagingService', () => {
  it('stores a customer message once and schedules one reply, even when Meta retries', async () => {
    const { service, scheduled, firestore } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));

    expect(scheduled).toEqual([{ conversationId: CONVERSATION, triggerId: 'wamid.1' }]);
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual(
      expect.objectContaining({
        channel: 'whatsapp',
        customerName: 'Ana',
        lastInboundId: 'wamid.1',
        lastMessagePreview: 'Hola',
      }),
    );
  });

  it('stores but schedules nothing while the assistant is off', async () => {
    const { service, scheduled, messages } = setup({ botEnabled: false });
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    expect(scheduled).toEqual([]);
    expect(await messages()).toHaveLength(1);
  });

  it('ignores messages from the store’s alert numbers', async () => {
    const { service, scheduled, messages } = setup({
      botEnabled: true,
      alertPhones: ['584141234567'],
    });
    expect(await service.handleWebhook(whatsappText('wamid.1', 'Hola'))).toEqual({
      inbound: 0,
      echoes: 0,
    });
    expect(scheduled).toEqual([]);
    expect(await messages()).toEqual([]);
  });

  it('deletes a chat with its messages', async () => {
    const { service, firestore, messages } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await service.handleWebhook(whatsappText('wamid.2', '¿Tienen cables?'));

    await service.deleteConversation(CONVERSATION);
    expect(await messages()).toEqual([]);
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toBeUndefined();
  });

  it('keeps a customer’s "no order updates" when their chat is deleted', async () => {
    const { service, firestore, messages, store } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'No me manden más avisos'));
    await store.setNoticesOff(CONVERSATION, true);

    await service.deleteConversation(CONVERSATION);
    expect(await messages()).toEqual([]);
    // Without lastMessageAt the chat list (ordered by it) leaves it out.
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual({
      channel: 'whatsapp',
      customerId: '584141234567',
      noticesOff: true,
    });
  });

  it('answers a burst of messages once, in the run of the newest', async () => {
    const { service, agentCalls, messages } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await service.handleWebhook(whatsappText('wamid.2', 'Busco bombillos'));

    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'superseded',
    );
    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.2' })).toBe(
      'replied',
    );

    expect(agentCalls).toHaveLength(1);
    expect(agentCalls[0].history.map((m) => m.text)).toEqual(['Hola', 'Busco bombillos']);
    expect(agentCalls[0].customerName).toBe('Ana');
    const stored = await messages();
    expect(stored.filter((m) => m.author === 'customer').every((m) => m.answered)).toBe(true);
    expect(stored.find((m) => m.author === 'bot')).toEqual(
      expect.objectContaining({ id: 'out-1', text: '¡Hola! ¿En qué le ayudo?' }),
    );
  });

  it('retries later while another run holds the chat', async () => {
    const { service, store } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await store.tryLock(CONVERSATION, 60_000);
    await expect(
      service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' }),
    ).rejects.toBeInstanceOf(ChatBusyError);
  });

  it('steps back when a person answers from the phone, and not for its own Instagram echoes', async () => {
    const { service, firestore, agent } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await service.handleWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                message_echoes: [
                  {
                    to: '584141234567',
                    id: 'wamid.e',
                    timestamp: '1760000005',
                    type: 'text',
                    text: { body: 'Hola Ana, soy María' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const conversation = firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION) as Record<
      string,
      unknown
    >;
    expect(conversation.pauseReason).toBe('human_reply');
    expect((conversation.botPausedUntil as Date).getTime()).toBeGreaterThan(
      Date.now() + 11 * 3600_000,
    );
    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'paused',
    );
    expect(agent.reply).not.toHaveBeenCalled();

    await service.handleWebhook({
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'ig' },
              recipient: { id: 'igsid' },
              timestamp: 1,
              message: { mid: 'e', text: 'x', is_echo: true, app_id: 'our-app' },
            },
          ],
        },
      ],
    });
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, 'instagram_igsid')).toBeUndefined();
  });

  it('tells the customer someone will follow up, hands over and alerts when the assistant fails', async () => {
    const { service, agent, sentTexts, firestore, events } = setup();
    const handoffs: unknown[] = [];
    events.on(CHAT_HANDOFF_EVENT, (e) => handoffs.push(e));
    agent.reply.mockRejectedValueOnce(new Error('overloaded'));
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));

    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'failed',
    );
    expect(sentTexts[0]).toMatch(/Una persona de la tienda le escribirá/);
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual(
      expect.objectContaining({ pauseReason: 'handoff', needsAttention: true }),
    );
    expect(handoffs).toEqual([
      expect.objectContaining({ conversationId: CONVERSATION, channel: 'whatsapp' }),
    ]);
  });

  it('counts each reply and its cost in the chat and in the day', async () => {
    const { service, firestore } = setup();
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' });
    await service.handleWebhook(whatsappText('wamid.2', 'Busco bombillos'));
    await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.2' });

    const now = new Date();
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual(
      expect.objectContaining({
        replyUsage: expect.objectContaining({
          day: storeDay(now),
          repliesToday: 2,
          hour: hourKey(now),
          repliesThisHour: 2,
        }),
      }),
    );
    // Haiku: 1000 in at US$0.10/M plus 100 out at US$0.50/M, twice.
    const day = firestore.read(
      Collections.MESSAGING_USAGE,
      storeDay(now),
    ) as unknown as DailyChatUsage;
    expect(day).toEqual(
      expect.objectContaining({ replies: 2, inputTokens: 2000, outputTokens: 200 }),
    );
    expect(day.costUsd).toBeCloseTo(0.0003, 8);
    expect(await service.usageToday()).toEqual(day);
  });

  it.each([
    ['replies in the hour', { chatRepliesPerHour: 3 }, { repliesThisHour: 3 }, /en una hora/],
    ['replies in the day', { chatRepliesPerDay: 10 }, { repliesToday: 10 }, /en el día/],
  ])(
    'hands the chat to a person, without calling Claude, once it reaches its %s',
    async (_limit, limits, counts, reason) => {
      const { service, firestore, agent, sentTexts, events } = setup({
        botEnabled: true,
        ...limits,
      });
      const handoffs: { reason: string }[] = [];
      events.on(CHAT_HANDOFF_EVENT, (e) => handoffs.push(e));
      await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
      const now = new Date();
      await firestore
        .collection(Collections.CHAT_CONVERSATIONS)
        .doc(CONVERSATION)
        .set(
          {
            replyUsage: {
              day: storeDay(now),
              repliesToday: 0,
              costTodayUsd: 0,
              hour: hourKey(now),
              repliesThisHour: 0,
              ...counts,
            },
          },
          { merge: true },
        );

      expect(
        await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' }),
      ).toBe('limited');
      expect(agent.reply).not.toHaveBeenCalled();
      expect(sentTexts).toEqual([expect.stringMatching(/Una persona de la tienda le escribirá/)]);
      expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual(
        expect.objectContaining({ pauseReason: 'handoff', needsAttention: true }),
      );
      expect(handoffs[0].reason).toMatch(reason);
    },
  );

  it('lets a chat go on when its count is from an earlier hour and day', async () => {
    const { service, firestore } = setup({ botEnabled: true, chatRepliesPerHour: 3 });
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));
    await firestore
      .collection(Collections.CHAT_CONVERSATIONS)
      .doc(CONVERSATION)
      .set(
        {
          replyUsage: {
            day: '2026-01-01',
            repliesToday: 500,
            costTodayUsd: 9,
            hour: '2026-01-01T10',
            repliesThisHour: 99,
          },
        },
        { merge: true },
      );
    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'replied',
    );
  });

  it('hands chats to a person once the day’s budget is spent', async () => {
    const { service, firestore, agent, events } = setup({ botEnabled: true, dailyBudgetUsd: 2 });
    const handoffs: { reason: string }[] = [];
    events.on(CHAT_HANDOFF_EVENT, (e) => handoffs.push(e));
    firestore.seed(Collections.MESSAGING_USAGE, storeDay(), { replies: 900, costUsd: 2.01 });
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));

    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'limited',
    );
    expect(agent.reply).not.toHaveBeenCalled();
    expect(handoffs[0].reason).toBe('El asistente llegó a su gasto máximo del día (US$ 2.00).');
  });

  it('never leaves the customer without an answer when the reply ends with nothing to say', async () => {
    const { service, agent, sentTexts, firestore } = setup();
    agent.reply.mockResolvedValueOnce({
      repliedWithText: false,
      handedOver: false,
      stopReason: 'max_tokens',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    });
    await service.handleWebhook(whatsappText('wamid.1', 'Hola'));

    expect(await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.1' })).toBe(
      'replied',
    );
    expect(sentTexts).toEqual([expect.stringMatching(/Una persona de la tienda le escribirá/)]);
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CONVERSATION)).toEqual(
      expect.objectContaining({
        pauseReason: 'handoff',
        handoffSummary: expect.stringContaining('quedó incompleta'),
      }),
    );
  });

  it('shows the assistant only the newest three photos of a burst', async () => {
    const { service, channels } = setup();
    for (let i = 1; i <= 5; i++) {
      await service.handleWebhook(whatsappImage(`wamid.${i}`, `media-${i}`));
    }
    await service.processReply({ conversationId: CONVERSATION, triggerId: 'wamid.5' });
    expect(
      (channels.loadImage.mock.calls as unknown as [{ mediaId: string }][]).map(
        ([media]) => media.mediaId,
      ),
    ).toEqual(['media-3', 'media-4', 'media-5']);
  });

  it('answers Meta’s subscription check only with the right token', () => {
    const { service } = setup();
    expect(service.verifySubscription('subscribe', 'tok', '123')).toBe('123');
    expect(service.verifySubscription('subscribe', 'otro', '123')).toBeNull();
  });
});

describe('splitPending', () => {
  const m = (id: string, author: ChatMessage['author'], answered = false) =>
    ({ id, author, kind: 'text', text: id, at: new Date(0), answered }) as ChatMessage;

  it('takes unanswered customer messages after the last person of the store spoke', () => {
    const { earlier, pending } = splitPending([
      m('c1', 'customer'),
      m('h1', 'human'),
      m('c2', 'customer', true),
      m('b1', 'bot'),
      m('c3', 'customer'),
    ]);
    expect(pending.map((x) => x.id)).toEqual(['c3']);
    expect(earlier.map((x) => x.id)).toEqual(['c1', 'h1', 'c2', 'b1']);
  });

  it('moves a message that arrived while a reply was written to the end', () => {
    const { earlier, pending } = splitPending([
      m('c1', 'customer', true),
      m('c2', 'customer'),
      m('b1', 'bot'),
    ]);
    expect([...earlier, ...pending].map((x) => x.id)).toEqual(['c1', 'b1', 'c2']);
  });
});
