import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChatChannel, ChatMedia, ChatMessageKind } from '../entities/chat.entity';

/** A customer's message, the same shape whichever channel it came from. */
export interface InboundChatMessage {
  channel: ChatChannel;
  customerId: string;
  customerName?: string;
  externalId: string;
  at: Date;
  kind: ChatMessageKind;
  text: string;
  media?: ChatMedia;
}

/** A message the business sent outside this API: from the WhatsApp Business
 * app (coexistence echoes) or from Instagram. Our own sends echo back on
 * Instagram too; `appId` tells them apart. */
export interface EchoedChatMessage {
  channel: ChatChannel;
  customerId: string;
  externalId: string;
  at: Date;
  text: string;
  appId?: string;
}

export interface WebhookEvents {
  inbound: InboundChatMessage[];
  echoes: EchoedChatMessage[];
}

/**
 * Meta signs every webhook body with the app secret (X-Hub-Signature-256:
 * "sha256=<hex>"). The API is public, so this is what keeps anyone else
 * from posting fake customer messages.
 */
export function isValidMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

function fromUnixSeconds(v: unknown): Date {
  const seconds = Number(v);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function fromUnixMillis(v: unknown): Date {
  const ms = Number(v);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date();
}

/** Every customer message and business echo in one webhook delivery. Meta
 * batches several entries and changes per POST. Anything else (delivery
 * statuses, reactions, reads, history sync) is dropped. */
export function parseWebhook(body: unknown): WebhookEvents {
  const payload = asObject(body);
  const events: WebhookEvents = { inbound: [], echoes: [] };
  if (payload.object === 'whatsapp_business_account') {
    for (const entry of asArray(payload.entry)) {
      for (const change of asArray(asObject(entry).changes)) {
        parseWhatsappChange(asObject(change), events);
      }
    }
  } else if (payload.object === 'instagram') {
    for (const entry of asArray(payload.entry)) {
      for (const event of asArray(asObject(entry).messaging)) {
        parseInstagramEvent(asObject(event), events);
      }
    }
  }
  return events;
}

function parseWhatsappChange(change: Json, events: WebhookEvents): void {
  const value = asObject(change.value);
  if (change.field === 'messages') {
    const names = new Map<string, string>();
    for (const contact of asArray(value.contacts)) {
      const c = asObject(contact);
      const name = asString(asObject(c.profile).name);
      const waId = asString(c.wa_id);
      if (waId && name) names.set(waId, name);
    }
    for (const raw of asArray(value.messages)) {
      const message = asObject(raw);
      const from = asString(message.from);
      const id = asString(message.id);
      if (!from || !id) continue;
      const content = whatsappContent(message);
      if (!content) continue;
      events.inbound.push({
        channel: 'whatsapp',
        customerId: from,
        customerName: names.get(from),
        externalId: id,
        at: fromUnixSeconds(message.timestamp),
        ...content,
      });
    }
  } else if (change.field === 'smb_message_echoes') {
    for (const raw of asArray(value.message_echoes)) {
      const echo = asObject(raw);
      const to = asString(echo.to);
      const id = asString(echo.id);
      if (!to || !id) continue;
      events.echoes.push({
        channel: 'whatsapp',
        customerId: to,
        externalId: id,
        at: fromUnixSeconds(echo.timestamp),
        text: whatsappContent(echo)?.text ?? '',
      });
    }
  }
}

type Content = Pick<InboundChatMessage, 'kind' | 'text' | 'media'>;

function whatsappContent(message: Json): Content | null {
  const type = asString(message.type);
  const part = asObject(type ? message[type] : undefined);
  const caption = asString(part.caption) ?? '';
  switch (type) {
    case 'text':
      return { kind: 'text', text: asString(part.body) ?? '' };
    case 'image': {
      const mediaId = asString(part.id);
      return {
        kind: 'image',
        text: caption,
        media: mediaId
          ? { source: 'whatsapp', mediaId, mimeType: asString(part.mime_type) }
          : undefined,
      };
    }
    case 'audio':
      return { kind: 'audio', text: '[Nota de voz]' };
    case 'video':
      return { kind: 'video', text: joined('[Video]', caption) };
    case 'document':
      return {
        kind: 'document',
        text: joined(`[Documento${part.filename ? `: ${String(part.filename)}` : ''}]`, caption),
      };
    case 'sticker':
      return { kind: 'sticker', text: '[Sticker]' };
    case 'location': {
      const place = [asString(part.name), asString(part.address)].filter(Boolean).join(', ');
      return {
        kind: 'location',
        text: `[Ubicación${place ? `: ${place}` : ''} (${String(part.latitude)}, ${String(part.longitude)})]`,
      };
    }
    case 'contacts':
      return { kind: 'contacts', text: '[Contacto compartido]' };
    case 'interactive': {
      const reply = asObject(part.button_reply ?? part.list_reply);
      return { kind: 'text', text: asString(reply.title) ?? '' };
    }
    case 'button':
      return { kind: 'text', text: asString(part.text) ?? '' };
    default:
      // reaction, order, system, unsupported, request_welcome…
      return null;
  }
}

function joined(label: string, caption: string): string {
  return caption ? `${label} ${caption}` : label;
}

function parseInstagramEvent(event: Json, events: WebhookEvents): void {
  const message = asObject(event.message);
  const mid = asString(message.mid);
  if (!mid || message.is_deleted || message.is_unsupported) return;
  const sender = asString(asObject(event.sender).id);
  const recipient = asString(asObject(event.recipient).id);
  const at = fromUnixMillis(event.timestamp);
  const content = instagramContent(message);

  if (message.is_echo) {
    if (!recipient) return;
    events.echoes.push({
      channel: 'instagram',
      customerId: recipient,
      externalId: mid,
      at,
      text: content?.text ?? '',
      appId: message.app_id != null ? String(message.app_id) : undefined,
    });
    return;
  }
  if (!sender || !content) return;
  events.inbound.push({
    channel: 'instagram',
    customerId: sender,
    externalId: mid,
    at,
    ...content,
  });
}

const INSTAGRAM_ATTACHMENT_TEXT: Record<string, string> = {
  audio: '[Nota de voz]',
  video: '[Video]',
  file: '[Archivo]',
  share: '[Publicación compartida]',
  ig_post: '[Publicación compartida]',
  reel: '[Reel compartido]',
  ig_reel: '[Reel compartido]',
  story_mention: '[Mención en una historia]',
};

function instagramContent(message: Json): Content | null {
  const text = asString(message.text) ?? '';
  const attachment = asObject(asArray(message.attachments)[0]);
  const type = asString(attachment.type);
  if (!type) return text ? { kind: 'text', text } : null;

  const url = asString(asObject(attachment.payload).url);
  if (type === 'image') {
    return { kind: 'image', text, media: url ? { source: 'url', url } : undefined };
  }
  const label = INSTAGRAM_ATTACHMENT_TEXT[type] ?? '[Adjunto]';
  const kind: ChatMessageKind =
    type === 'audio'
      ? 'audio'
      : type === 'video'
        ? 'video'
        : type === 'file'
          ? 'document'
          : 'share';
  return { kind, text: joined(label, text) };
}
