import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MESSAGING_SETTINGS, type ChatMessage } from '../entities/chat.entity';
import { buildConversation, SalesAgentService, type SalesTurnInput } from './sales-agent.service';
import type { SalesToolDeps } from './sales-tools';

function message(
  id: string,
  author: ChatMessage['author'],
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    author,
    kind: 'text',
    text,
    at: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 3,
  cache_creation_input_tokens: 0,
};

function response(content: unknown[], stop_reason: string): Anthropic.Message {
  return {
    id: 'r',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    usage,
  } as never;
}

function setup(responses: Anthropic.Message[]) {
  const requests: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      create: jest.fn(async (params: Anthropic.MessageCreateParams) => {
        // Snapshot: the loop keeps appending to the same array.
        requests.push(structuredClone(params));
        return responses.shift();
      }),
    },
  };
  const sent: string[] = [];
  const handOver = jest.fn(async () => {});
  const tools: SalesToolDeps = {
    catalog: async () => [],
    paymentMethods: async () => [],
    bcvRate: async () => null,
    shippingQuote: async () => ({ amount: 0, matched: false }),
    siteUrl: 'https://x.ve',
    sendProducts: async () => {},
    handOver,
  };
  const input: SalesTurnInput = {
    channel: 'whatsapp',
    customerName: 'Ana',
    history: [message('m1', 'customer', '¿Tienen breakers?')],
    images: new Map(),
    settings: DEFAULT_MESSAGING_SETTINGS,
    now: new Date('2026-10-20T15:00:00Z'),
    tools,
    sendText: async (text) => {
      sent.push(text);
    },
  };
  return { agent: new SalesAgentService(client as never), requests, sent, input, handOver };
}

describe('SalesAgentService.reply', () => {
  it('runs the tools, sends every text, and appends each response unchanged', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    const { agent, requests, sent, input } = setup([
      response(
        [
          thinking,
          { type: 'text', text: 'Permítame revisar.' },
          { type: 'tool_use', id: 't1', name: 'buscar_productos', input: { consulta: 'breaker' } },
        ],
        'tool_use',
      ),
      response([{ type: 'text', text: 'Por ahora no tenemos breakers.' }], 'end_turn'),
    ]);

    const result = await agent.reply(input);

    expect(sent).toEqual(['Permítame revisar.', 'Por ahora no tenemos breakers.']);
    expect(result).toEqual(
      expect.objectContaining({ repliedWithText: true, handedOver: false, stopReason: 'end_turn' }),
    );
    expect(result.usage).toEqual({ input: 20, output: 10, cacheRead: 6, cacheWrite: 0 });

    const [first, second] = requests;
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.output_config).toEqual({ effort: 'medium' });
    expect((first.system as Anthropic.TextBlockParam[])[0].cache_control).toEqual({
      type: 'ephemeral',
    });
    expect((first.system as Anthropic.TextBlockParam[])[1].text).toContain('Cliente: Ana.');
    // Append-only: the second request is the first plus the response and the tool result.
    expect(second.messages.slice(0, 1)).toEqual(first.messages);
    expect(second.messages[1]).toEqual({ role: 'assistant', content: requestsContent(thinking) });
    expect(second.messages[2]).toEqual({
      role: 'user',
      content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 't1' })],
    });
    expect(second.system).toEqual(first.system);
  });

  it('reports a handoff', async () => {
    const { agent, input, handOver } = setup([
      response(
        [
          {
            type: 'tool_use',
            id: 't1',
            name: 'pasar_a_asesor',
            input: { motivo: 'Mayor', resumen: '100 breakers' },
          },
        ],
        'tool_use',
      ),
      response([{ type: 'text', text: 'Un asesor le escribirá.' }], 'end_turn'),
    ]);
    const result = await agent.reply(input);
    expect(result.handedOver).toBe(true);
    expect(handOver).toHaveBeenCalledWith('Mayor', '100 breakers');
  });

  it('runs no tools on a refusal', async () => {
    const { agent, input, requests } = setup([
      response([{ type: 'tool_use', id: 't1', name: 'pasar_a_asesor', input: {} }], 'refusal'),
    ]);
    const result = await agent.reply(input);
    expect(result).toEqual(
      expect.objectContaining({ repliedWithText: false, stopReason: 'refusal' }),
    );
    expect(requests).toHaveLength(1);
  });

  it('does nothing when the last word is not the customer’s', async () => {
    const { agent, input, requests } = setup([]);
    await agent.reply({
      ...input,
      history: [message('m1', 'customer', 'Hola'), message('b1', 'bot', 'Hola, ¿en qué le ayudo?')],
    });
    expect(requests).toHaveLength(0);
  });
});

function requestsContent(thinking: unknown) {
  return [
    thinking,
    { type: 'text', text: 'Permítame revisar.' },
    { type: 'tool_use', id: 't1', name: 'buscar_productos', input: { consulta: 'breaker' } },
  ];
}

describe('buildConversation', () => {
  it('starts at the customer, merges same-side turns and labels the staff', () => {
    const turns = buildConversation(
      [
        message('b0', 'bot', '¡Hola!'),
        message('m1', 'customer', 'Busco bombillos'),
        message('m2', 'customer', 'de 9W'),
        message('b1', 'bot', '', {
          kind: 'products',
          products: [{ id: 'p1', name: 'Bombillo 9W', price: 2.5 }],
        }),
        message('h1', 'human', 'Le llamo ahora'),
        message('m3', 'customer', '', { kind: 'image', media: { source: 'url', url: 'u' } }),
      ],
      new Map([['m3', { data: Buffer.from('img'), mimeType: 'image/jpeg' }]]),
    );
    expect(turns).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Busco bombillos' },
          { type: 'text', text: 'de 9W' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '[Tarjetas de producto enviadas: Bombillo 9W (id p1, REF 2,50)]' },
          { type: 'text', text: '[Respondió una persona de la tienda] Le llamo ahora' },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: Buffer.from('img').toString('base64'),
            },
          },
        ],
      },
    ]);
  });

  it('marks a photo it could not load', () => {
    const turns = buildConversation([message('m1', 'customer', '', { kind: 'image' })], new Map());
    expect(turns).toEqual([{ role: 'user', content: [{ type: 'text', text: '[Foto]' }] }]);
  });
});
