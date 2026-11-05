import { createHmac } from 'node:crypto';
import { isValidMetaSignature, parseWebhook } from './webhook-events';

const whatsapp = (field: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field, value: { messaging_product: 'whatsapp', ...value } }] }],
});

describe('isValidMetaSignature', () => {
  const body = Buffer.from('{"object":"instagram"}');
  const sign = (secret: string) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts the body signed with the app secret', () => {
    expect(isValidMetaSignature(body, sign('secreto'), 'secreto')).toBe(true);
  });

  it('rejects another secret, a missing header or a missing body', () => {
    expect(isValidMetaSignature(body, sign('otro'), 'secreto')).toBe(false);
    expect(isValidMetaSignature(body, undefined, 'secreto')).toBe(false);
    expect(isValidMetaSignature(undefined, sign('secreto'), 'secreto')).toBe(false);
    expect(isValidMetaSignature(body, 'sha256=abc', 'secreto')).toBe(false);
  });
});

describe('parseWebhook — WhatsApp', () => {
  it('reads a text with the contact name and the time', () => {
    const { inbound, echoes } = parseWebhook(
      whatsapp('messages', {
        contacts: [{ profile: { name: 'Ana' }, wa_id: '584141234567' }],
        messages: [
          {
            from: '584141234567',
            id: 'wamid.1',
            timestamp: '1760000000',
            type: 'text',
            text: { body: 'Hola' },
          },
        ],
      }),
    );
    expect(echoes).toEqual([]);
    expect(inbound).toEqual([
      {
        channel: 'whatsapp',
        customerId: '584141234567',
        customerName: 'Ana',
        externalId: 'wamid.1',
        at: new Date(1760000000 * 1000),
        kind: 'text',
        text: 'Hola',
      },
    ]);
  });

  it('keeps a photo with its caption and media id, and describes a voice note', () => {
    const { inbound } = parseWebhook(
      whatsapp('messages', {
        messages: [
          {
            from: '58',
            id: 'w1',
            timestamp: '1',
            type: 'image',
            image: { id: 'm1', mime_type: 'image/jpeg', caption: '¿Tienen este?' },
          },
          { from: '58', id: 'w2', timestamp: '2', type: 'audio', audio: { id: 'm2', voice: true } },
          {
            from: '58',
            id: 'w3',
            timestamp: '3',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'b', title: 'Sí' } },
          },
        ],
      }),
    );
    expect(inbound.map((m) => [m.kind, m.text, m.media])).toEqual([
      ['image', '¿Tienen este?', { source: 'whatsapp', mediaId: 'm1', mimeType: 'image/jpeg' }],
      ['audio', '[Nota de voz]', undefined],
      ['text', 'Sí', undefined],
    ]);
  });

  it('drops delivery statuses and reactions', () => {
    const { inbound } = parseWebhook(
      whatsapp('messages', {
        statuses: [{ id: 'wamid.x', status: 'read' }],
        messages: [
          { from: '58', id: 'w1', timestamp: '1', type: 'reaction', reaction: { emoji: '👍' } },
        ],
      }),
    );
    expect(inbound).toEqual([]);
  });

  it('says what it dropped, with no number or text from the customer', () => {
    const { inbound, skipped } = parseWebhook(
      whatsapp('messages', {
        contacts: [{ profile: { name: 'Ana' }, wa_id: '584141234567' }],
        messages: [
          {
            from: '584141234567',
            id: 'w1',
            timestamp: '1',
            type: 'unsupported',
            errors: [{ code: 131060, title: 'Message type unknown', details: 'Hola Ana' }],
          },
          { id: 'w2', timestamp: '1', type: 'text', text: { body: 'Hola' } },
        ],
        statuses: [
          { id: 'w3', status: 'delivered', recipient_id: '584141234567' },
          {
            id: 'w4',
            status: 'failed',
            recipient_id: '584141234567',
            errors: [{ code: 131026, title: 'Not delivered' }],
          },
        ],
      }),
    );
    expect(inbound).toEqual([]);
    expect(skipped).toEqual([
      'whatsapp unsupported message (131060 Message type unknown)',
      'whatsapp message with only id, timestamp, type, text',
      'whatsapp failed delivery (131026 Not delivered)',
    ]);
  });

  it('names a change it has no use for', () => {
    expect(parseWebhook(whatsapp('history', { history: [] })).skipped).toEqual([
      'whatsapp history change',
    ]);
  });

  it('reads a coexistence echo (sent from the WhatsApp Business app) as the business speaking', () => {
    const { inbound, echoes } = parseWebhook(
      whatsapp('smb_message_echoes', {
        message_echoes: [
          {
            from: '584245555990',
            to: '584141234567',
            id: 'wamid.e',
            timestamp: '5',
            type: 'text',
            text: { body: 'Ya le atiendo' },
          },
        ],
      }),
    );
    expect(inbound).toEqual([]);
    expect(echoes).toEqual([
      {
        channel: 'whatsapp',
        customerId: '584141234567',
        externalId: 'wamid.e',
        at: new Date(5000),
        text: 'Ya le atiendo',
      },
    ]);
  });
});

describe('parseWebhook — Instagram', () => {
  const instagram = (messaging: unknown[]) => ({
    object: 'instagram',
    entry: [{ id: 'ig', time: 1, messaging }],
  });

  it('reads a text and a photo from the customer', () => {
    const { inbound } = parseWebhook(
      instagram([
        {
          sender: { id: 'igsid' },
          recipient: { id: 'ig' },
          timestamp: 1000,
          message: { mid: 'm1', text: 'Buenas' },
        },
        {
          sender: { id: 'igsid' },
          recipient: { id: 'ig' },
          timestamp: 2000,
          message: {
            mid: 'm2',
            attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }],
          },
        },
        {
          sender: { id: 'igsid' },
          recipient: { id: 'ig' },
          timestamp: 3000,
          message: {
            mid: 'm3',
            attachments: [{ type: 'story_mention', payload: { url: 'https://cdn/s' } }],
          },
        },
      ]),
    );
    expect(inbound.map((m) => [m.customerId, m.externalId, m.kind, m.text, m.media])).toEqual([
      ['igsid', 'm1', 'text', 'Buenas', undefined],
      ['igsid', 'm2', 'image', '', { source: 'url', url: 'https://cdn/x.jpg' }],
      ['igsid', 'm3', 'share', '[Mención en una historia]', undefined],
    ]);
  });

  it('reads an echo as the business speaking to the recipient, with the sending app', () => {
    const { inbound, echoes } = parseWebhook(
      instagram([
        {
          sender: { id: 'ig' },
          recipient: { id: 'igsid' },
          timestamp: 1000,
          message: { mid: 'e1', text: 'Hola, soy María', is_echo: true, app_id: 123 },
        },
      ]),
    );
    expect(inbound).toEqual([]);
    expect(echoes).toEqual([
      {
        channel: 'instagram',
        customerId: 'igsid',
        externalId: 'e1',
        at: new Date(1000),
        text: 'Hola, soy María',
        appId: '123',
      },
    ]);
  });

  it('ignores deleted messages and payloads from other products', () => {
    expect(
      parseWebhook(
        instagram([
          { sender: { id: 'x' }, recipient: { id: 'ig' }, message: { mid: 'm', is_deleted: true } },
        ]),
      ),
    ).toEqual({ inbound: [], echoes: [], skipped: [] });
    expect(parseWebhook({ object: 'page', entry: [] })).toEqual({
      inbound: [],
      echoes: [],
      skipped: [],
    });
    expect(parseWebhook(null)).toEqual({ inbound: [], echoes: [], skipped: [] });
  });
});
