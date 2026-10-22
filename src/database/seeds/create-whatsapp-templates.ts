import { Logger } from '@nestjs/common';
import { ALERT_TEMPLATES } from '../../modules/messaging/meta/alert-templates';
import { CUSTOMER_TEMPLATES } from '../../modules/messaging/meta/customer-templates';
import { templateDefinition } from '../../modules/messaging/meta/whatsapp-template';

const logger = new Logger('WhatsappTemplates');

/** Submits the app's WhatsApp templates (the admin alerts and the customer
 * updates) to a WhatsApp Business account for Meta's review, skipping the
 * ones already there. Reads META_ACCESS_TOKEN, META_GRAPH_VERSION and
 * PUBLIC_SITE_URL from the environment. */
async function run() {
  const [wabaId] = process.argv.slice(2);
  const token = process.env.META_ACCESS_TOKEN;
  if (!wabaId || !token) {
    logger.error('Usage: META_ACCESS_TOKEN=… npm run whatsapp:templates -- <WABA_ID>');
    process.exit(1);
  }
  const version = process.env.META_GRAPH_VERSION ?? 'v25.0';
  const siteUrl = process.env.PUBLIC_SITE_URL ?? 'https://electronplus.com.ve';
  const endpoint = `https://graph.facebook.com/${version}/${wabaId}/message_templates`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const existing = (await (
    await fetch(`${endpoint}?fields=name&limit=500`, { headers })
  ).json()) as { data?: { name: string }[] };
  const taken = new Set((existing.data ?? []).map((t) => t.name));

  let failed = 0;
  for (const template of [...ALERT_TEMPLATES, ...CUSTOMER_TEMPLATES]) {
    if (taken.has(template.name)) {
      logger.log(`${template.name}: already there`);
      continue;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(templateDefinition(template, siteUrl)),
    });
    const body = (await res.json()) as {
      status?: string;
      category?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (res.ok) {
      logger.log(`${template.name}: ${body.status} (${body.category})`);
    } else {
      failed++;
      logger.error(
        `${template.name}: Meta answered ${res.status}: ${body.error?.error_user_msg ?? body.error?.message}`,
      );
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

run();
