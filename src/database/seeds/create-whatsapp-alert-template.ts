import { Logger } from '@nestjs/common';
import { alertTemplateDefinition } from '../../modules/messaging/meta/alert-template';

const logger = new Logger('WhatsappAlertTemplate');

/** Submits the admin alert template to a WhatsApp Business account for
 * Meta's review. Reads META_ACCESS_TOKEN, META_GRAPH_VERSION and
 * PUBLIC_SITE_URL from the environment. */
async function run() {
  const [wabaId] = process.argv.slice(2);
  const token = process.env.META_ACCESS_TOKEN;
  if (!wabaId || !token) {
    logger.error('Usage: META_ACCESS_TOKEN=… npm run whatsapp:alert-template -- <WABA_ID>');
    process.exit(1);
  }
  const version = process.env.META_GRAPH_VERSION ?? 'v25.0';
  const siteUrl = process.env.PUBLIC_SITE_URL ?? 'https://electronplus.com.ve';

  const res = await fetch(`https://graph.facebook.com/${version}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(alertTemplateDefinition(siteUrl)),
  });
  const body = (await res.json()) as {
    id?: string;
    status?: string;
    category?: string;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    logger.error(
      `Meta answered ${res.status}: ${body.error?.error_user_msg ?? body.error?.message}`,
    );
    process.exit(1);
  }
  logger.log(`Template ${body.id}: ${body.status} (${body.category})`);
}

run();
