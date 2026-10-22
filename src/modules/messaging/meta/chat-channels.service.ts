import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.validation';
import type { ChatChannel, ChatMedia } from '../entities/chat.entity';
import {
  ALERT_DETAIL_LIMIT,
  ALERT_TEMPLATE_LANGUAGE,
  ALERT_TEMPLATE_NAME,
  ALERT_TITLE_LIMIT,
} from './alert-template';
import { fetchMedia, graphRequest } from './graph-api';

/** A product as a card: WhatsApp sends an image with a button, Instagram a
 * carousel element. */
export interface ProductCardContent {
  title: string;
  /** Price and a line about the product. */
  details: string;
  imageUrl?: string;
  url: string;
}

/** Longest text each channel takes in one message. */
const TEXT_LIMIT: Record<ChatChannel, number> = { whatsapp: 4096, instagram: 1000 };
const WHATSAPP_CARD_BODY_LIMIT = 1024;
const INSTAGRAM_CARD_TEXT_LIMIT = 80;
const INSTAGRAM_CAROUSEL_LIMIT = 10;
const CARD_BUTTON = 'Ver producto';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** System-user Page tokens don't expire; re-read now and then anyway in case
 * one is revoked and reissued. */
const PAGE_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Sends on WhatsApp (Cloud API) and Instagram (Messenger API, through the
 * Facebook Page the account is linked to). Both use the same system-user
 * token; Instagram needs the Page's own token, derived from it.
 */
@Injectable()
export class ChatChannelsService {
  private readonly logger = new Logger(ChatChannelsService.name);
  private pageToken: { value: string; at: number } | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get version(): string {
    return this.config.get('META_GRAPH_VERSION', { infer: true });
  }

  private get token(): string {
    return this.config.get('META_ACCESS_TOKEN', { infer: true }) ?? '';
  }

  isConfigured(channel: ChatChannel): boolean {
    if (!this.token) return false;
    return channel === 'whatsapp'
      ? Boolean(this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true }))
      : Boolean(this.config.get('INSTAGRAM_PAGE_ID', { infer: true }));
  }

  /** Sends the text, split at paragraph breaks when it's longer than the
   * channel allows. Returns Meta's ids for what was sent. */
  async sendText(channel: ChatChannel, customerId: string, text: string): Promise<string[]> {
    const ids: string[] = [];
    const body = channel === 'instagram' ? stripWhatsappFormatting(text) : text;
    for (const part of splitText(body, TEXT_LIMIT[channel])) {
      const id =
        channel === 'whatsapp'
          ? await this.whatsappSend(customerId, {
              type: 'text',
              text: { body: part, preview_url: true },
            })
          : await this.instagramSend(customerId, { text: part });
      if (id) ids.push(id);
    }
    return ids;
  }

  async sendProducts(
    channel: ChatChannel,
    customerId: string,
    cards: ProductCardContent[],
  ): Promise<string[]> {
    if (channel === 'instagram') {
      const ids: string[] = [];
      for (let i = 0; i < cards.length; i += INSTAGRAM_CAROUSEL_LIMIT) {
        const id = await this.instagramSend(customerId, {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: cards.slice(i, i + INSTAGRAM_CAROUSEL_LIMIT).map(instagramElement),
            },
          },
        });
        if (id) ids.push(id);
      }
      return ids;
    }

    const ids: string[] = [];
    for (const card of cards) {
      const id = await this.whatsappSend(customerId, {
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(card.imageUrl ? { header: { type: 'image', image: { link: card.imageUrl } } } : {}),
          body: { text: truncate(`*${card.title}*\n${card.details}`, WHATSAPP_CARD_BODY_LIMIT) },
          action: { name: 'cta_url', parameters: { display_text: CARD_BUTTON, url: card.url } },
        },
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  /** An admin alert on WhatsApp, through the approved template (see
   * alert-template.ts): it reaches the number even with no open chat. */
  async sendAlert(
    to: string,
    alert: { title: string; detail: string; panelPath: string },
  ): Promise<string | undefined> {
    return this.sendTemplate(to, ALERT_TEMPLATE_NAME, {
      body: [
        templateParam(alert.title, ALERT_TITLE_LIMIT),
        templateParam(alert.detail, ALERT_DETAIL_LIMIT),
      ],
      button: alert.panelPath,
    });
  }

  /** An approved WhatsApp template (Spanish): its body parameters in order,
   * and the end of its URL button's address when the button takes one. */
  async sendTemplate(
    to: string,
    name: string,
    params: { body: string[]; button?: string },
  ): Promise<string | undefined> {
    return this.whatsappSend(to, {
      type: 'template',
      template: {
        name,
        language: { code: ALERT_TEMPLATE_LANGUAGE },
        components: [
          {
            type: 'body',
            parameters: params.body.map((text) => ({ type: 'text', text })),
          },
          ...(params.button
            ? [
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: params.button }],
                },
              ]
            : []),
        ],
      },
    });
  }

  /** "Seen" and "typing…" while the assistant thinks. Cosmetic: a failure
   * here never stops the reply. */
  async showTyping(channel: ChatChannel, customerId: string, lastInboundId: string): Promise<void> {
    try {
      if (channel === 'whatsapp') {
        await graphRequest(this.version, `${this.phoneNumberId()}/messages`, this.token, {
          body: {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: lastInboundId,
            typing_indicator: { type: 'text' },
          },
        });
      } else {
        const pageToken = await this.instagramPageToken();
        for (const action of ['mark_seen', 'typing_on']) {
          await graphRequest(this.version, `${this.pageId()}/messages`, pageToken, {
            body: { recipient: { id: customerId }, sender_action: action },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Typing indicator failed on ${channel}: ${(error as Error).message}`);
    }
  }

  /** The bytes of a photo the customer sent, for the assistant to look at.
   * Null for anything that isn't an image Claude reads. */
  async loadImage(media: ChatMedia): Promise<{ data: Buffer; mimeType: string } | null> {
    let file: { data: Buffer; mimeType: string };
    if (media.source === 'whatsapp') {
      const meta = await graphRequest<{ url?: string; mime_type?: string }>(
        this.version,
        media.mediaId,
        this.token,
      );
      if (!meta.url) return null;
      file = await fetchMedia(meta.url, this.token);
      file.mimeType = meta.mime_type ?? file.mimeType;
    } else {
      file = await fetchMedia(media.url);
    }
    return IMAGE_TYPES.has(file.mimeType) ? file : null;
  }

  /** Instagram webhooks carry only an id; the name comes from the profile. */
  async instagramName(customerId: string): Promise<string | undefined> {
    try {
      const profile = await graphRequest<{ name?: string; username?: string }>(
        this.version,
        `${customerId}?fields=name,username`,
        await this.instagramPageToken(),
      );
      return profile.name || (profile.username ? `@${profile.username}` : undefined);
    } catch (error) {
      this.logger.warn(`Instagram profile lookup failed: ${(error as Error).message}`);
      return undefined;
    }
  }

  private phoneNumberId(): string {
    return this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true }) ?? '';
  }

  private pageId(): string {
    return this.config.get('INSTAGRAM_PAGE_ID', { infer: true }) ?? '';
  }

  private async whatsappSend(
    to: string,
    message: Record<string, unknown>,
  ): Promise<string | undefined> {
    const res = await graphRequest<{ messages?: { id?: string }[] }>(
      this.version,
      `${this.phoneNumberId()}/messages`,
      this.token,
      { body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message } },
    );
    return res.messages?.[0]?.id;
  }

  private async instagramSend(
    customerId: string,
    message: Record<string, unknown>,
  ): Promise<string | undefined> {
    const res = await graphRequest<{ message_id?: string }>(
      this.version,
      `${this.pageId()}/messages`,
      await this.instagramPageToken(),
      { body: { recipient: { id: customerId }, message } },
    );
    return res.message_id;
  }

  private async instagramPageToken(): Promise<string> {
    if (this.pageToken && Date.now() - this.pageToken.at < PAGE_TOKEN_TTL_MS) {
      return this.pageToken.value;
    }
    const page = await graphRequest<{ access_token?: string }>(
      this.version,
      `${this.pageId()}?fields=access_token`,
      this.token,
    );
    if (!page.access_token) {
      throw new Error(
        'La Página de Facebook no devolvió su token: revisa que el usuario del sistema la tenga asignada',
      );
    }
    this.pageToken = { value: page.access_token, at: Date.now() };
    return page.access_token;
  }
}

function instagramElement(card: ProductCardContent) {
  return {
    title: truncate(card.title, INSTAGRAM_CARD_TEXT_LIMIT),
    subtitle: truncate(card.details.replace(/\s*\n\s*/g, ' · '), INSTAGRAM_CARD_TEXT_LIMIT),
    ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
    default_action: { type: 'web_url', url: card.url },
    buttons: [{ type: 'web_url', url: card.url, title: CARD_BUTTON }],
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One line, as Meta requires of a template parameter, and within `max`. */
export function templateParam(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max) || '—';
}

/** Instagram shows asterisks literally. */
export function stripWhatsappFormatting(text: string): string {
  return text
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '$1')
    .replace(/(^|\s)_(\S(?:[^_\n]*\S)?)_(?=\s|$)/g, '$1$2');
}

/** Pieces of at most `max` characters, cut at paragraph or line breaks when
 * possible, at a space otherwise. */
export function splitText(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('\n'),
      window.lastIndexOf(' '),
    );
    const at = cut > 0 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
