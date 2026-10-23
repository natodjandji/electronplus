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

function response(
  content: unknown[],
  stop_reason: string,
  tokens: Partial<Anthropic.Usage> = {},
): Anthropic.Message {
  return {
    id: 'r',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    usage: { ...usage, ...tokens },
  } as never;
}

function setup(responses: Anthropic.Message[], deps: Partial<SalesToolDeps> = {}) {
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
    ...deps,
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
    expect(first.model).toBe('claude-haiku-5-5');
    expect(first.output_config).toEqual({ effort: 'low' });
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

describe('SalesAgentService.reply guards', () => {
  const text = (t: string) => ({ type: 'text', text: t });
  const toolCall = (id: string, name: string, input: unknown) => ({
    type: 'tool_use',
    id,
    name,
    input,
  });

  it('drops links the store didn’t give and keeps its own and its tools’', async () => {
    const { agent, input, sent } = setup(
      [
        response(
          [
            text('Pague aquí: https://evil.example/pago o en x.ve/carrito.'),
            toolCall('t1', 'info_pagos_y_envios', {}),
          ],
          'tool_use',
        ),
        response([text('También por https://paypal.me/electronplus o bit.ly/abc.')], 'end_turn'),
      ],
      {
        paymentMethods: async () => [
          { label: 'PayPal', details: ['https://paypal.me/electronplus'] },
        ],
      },
    );
    await agent.reply(input);
    expect(sent).toEqual([
      'Pague aquí: o en x.ve/carrito.',
      'También por https://paypal.me/electronplus o.',
    ]);
  });

  it('sends at most three messages in one reply', async () => {
    const rounds = [1, 2, 3, 4].map((n) =>
      response(
        [text(`Mensaje ${n}`), toolCall(`t${n}`, 'buscar_productos', { consulta: 'x' })],
        'tool_use',
      ),
    );
    const { agent, input, sent } = setup([...rounds, response([text('Mensaje 5')], 'end_turn')]);
    await agent.reply(input);
    expect(sent).toEqual(['Mensaje 1', 'Mensaje 2', 'Mensaje 3']);
  });

  it('stops before a round that would take the reply past its cost limit', async () => {
    const { agent, input, requests } = setup([
      // 70,000 tokens in on Opus is US$0.28, over the US$0.25 a reply may cost.
      response([toolCall('t1', 'buscar_productos', { consulta: 'x' })], 'tool_use', {
        input_tokens: 70_000,
      }),
      response([text('No debería llegar')], 'end_turn'),
    ]);
    const result = await agent.reply({
      ...input,
      settings: { ...input.settings, model: 'claude-opus-5-5' },
    });
    expect(requests).toHaveLength(1);
    expect(result.stopReason).toBe('cost_limit');
    expect(result.repliedWithText).toBe(false);
  });

  it('adds the tokens up where the caller passed them, round by round', async () => {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const { agent, input } = setup([
      response([toolCall('t1', 'buscar_productos', { consulta: 'x' })], 'tool_use'),
      response([text('Listo')], 'end_turn'),
    ]);
    const result = await agent.reply({ ...input, usage: tokens });
    expect(tokens).toEqual({ input: 20, output: 10, cacheRead: 6, cacheWrite: 0 });
    expect(result.usage).toBe(tokens);
  });

  it('shortens a reply that runs away', async () => {
    const long = `${'Una explicación larga. '.repeat(80)}`;
    const { agent, input, sent } = setup([response([text(long)], 'end_turn')]);
    await agent.reply(input);
    expect(sent[0].length).toBeLessThanOrEqual(1200);
    expect(sent[0]).toMatch(/larga\.$/);
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
  it('cuts a customer’s wall of text before the assistant reads it', () => {
    const [turn] = buildConversation([message('m1', 'customer', 'a'.repeat(5000))], new Map());
    const block = turn.content[0] as Anthropic.TextBlockParam;
    expect(block.text).toBe(`${'a'.repeat(1500)} […mensaje recortado]`);
  });

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
