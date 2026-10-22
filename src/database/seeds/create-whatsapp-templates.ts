import { Logger } from '@nestjs/common';
import { alertTemplateDefinition } from '../../modules/messaging/meta/alert-template';
import {
  CUSTOMER_TEMPLATES,
  customerTemplateDefinition,
} from '../../modules/messaging/meta/customer-templates';

const logger = new Logger('WhatsappTemplates');

/** Submits the app's WhatsApp templates (the admin alert and the customer
 * updates) to a WhatsApp Business account for Meta's review. One already
 * there is reported and skipped. Reads META_ACCESS_TOKEN,
 * META_GRAPH_VERSION and PUBLIC_SITE_URL from the environment. */
async function run() {
  const [wabaId] = process.argv.slice(2);
  const token = process.env.META_ACCESS_TOKEN;
  if (!wabaId || !token) {
    logger.error('Usage: META_ACCESS_TOKEN=… npm run whatsapp:templates -- <WABA_ID>');
    process.exit(1);
  }
  const version = process.env.META_GRAPH_VERSION ?? 'v25.0';
  const siteUrl = process.env.PUBLIC_SITE_URL ?? 'https://electronplus.com.ve';
  const definitions = [
    alertTemplateDefinition(siteUrl),
    ...CUSTOMER_TEMPLATES.map((t) => customerTemplateDefinition(t, siteUrl)),
  ];

  let failed = 0;
  for (const definition of definitions) {
    const res = await fetch(`https://graph.facebook.com/${version}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    });
    const body = (await res.json()) as {
      id?: string;
      status?: string;
      category?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (res.ok) {
      logger.log(`${definition.name}: ${body.status} (${body.category})`);
    } else {
      failed++;
      logger.error(
        `${definition.name}: Meta answered ${res.status}: ${body.error?.error_user_msg ?? body.error?.message}`,
      );
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

run();
