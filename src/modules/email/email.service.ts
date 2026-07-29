import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EnvConfig } from '../../config/env.validation';
import { BRAND_ATTACHMENTS } from './brand-assets';

/** Thin wrapper over Resend — a missing RESEND_API_KEY degrades to logging
 * instead of throwing, same pattern as the other optional integrations
 * (PayPal, ERP adapters) so local dev and early deploys don't need every
 * secret set to boot. Send failures are logged, never thrown — email is a
 * side effect of an order/account action, not something that should fail
 * the request that triggered it. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend?: Resend;
  private readonly from: string;
  private readonly replyTo: string;

  constructor(config: ConfigService<EnvConfig, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.from = config.get('RESEND_FROM_EMAIL', { infer: true });
    this.replyTo = config.get('RESEND_REPLY_TO', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : undefined;
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged instead of sent');
    }
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!to) return; // no email on file for this user — nothing to send
    if (!this.resend) {
      this.logger.log(`[email not sent, no RESEND_API_KEY] to=${to} subject="${subject}"`);
      return;
    }
    const { error } = await this.resend.emails.send({
      from: `Electron Plus <${this.from}>`,
      to,
      subject,
      html,
      replyTo: this.replyTo,
      attachments: BRAND_ATTACHMENTS,
    });
    if (error) {
      this.logger.error(`Failed to send email to ${to} ("${subject}"): ${error.message}`);
    }
  }
}
