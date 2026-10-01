import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.validation';

const GRAPH_API_VERSION = 'v21.0';

/**
 * Thin wrapper over Meta's WhatsApp Cloud API Send Message endpoint. Same
 * graceful-degradation as every other optional integration in this
 * codebase (PROFIT_PLUS_*, RESEND_*): with no access token/phone number id
 * configured, it logs what it would have sent instead of throwing — lets
 * the webhook + intent matching be developed and tested before the Meta
 * Business setup (app, verified number) exists.
 */
@Injectable()
export class WhatsAppClient {
  private readonly logger = new Logger(WhatsAppClient.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async sendText(to: string, body: string): Promise<void> {
    await this.send(to, { type: 'text', text: { body } });
  }

  async sendImage(to: string, link: string, caption?: string): Promise<void> {
    await this.send(to, { type: 'image', image: { link, caption } });
  }

  private async send(to: string, message: Record<string, unknown>): Promise<void> {
    const token = this.config.get('META_WHATSAPP_ACCESS_TOKEN', { infer: true });
    const phoneNumberId = this.config.get('META_WHATSAPP_PHONE_NUMBER_ID', { infer: true });
    const payload = { messaging_product: 'whatsapp', to, ...message };

    if (!token || !phoneNumberId) {
      this.logger.warn(
        `META_WHATSAPP_ACCESS_TOKEN/META_WHATSAPP_PHONE_NUMBER_ID not set — logging instead of sending: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
    }
  }
}
