/**
 * An approved WhatsApp message template, as the app sends it and as the
 * Business Management API takes it to create it. Templates live in the
 * sending number's WhatsApp Business account; a new number in another
 * account needs them created there too: npm run whatsapp:templates -- <WABA_ID>
 *
 * Meta rejects a body that starts or ends with a parameter, and a parameter
 * with line breaks, tabs or more than four spaces in a row (see
 * templateParam); the body as a whole is capped at 1024 characters.
 */
export interface WhatsappTemplate {
  name: string;
  body: string;
  example: string[];
  button: {
    text: string;
    /** After the site's address; a trailing {{1}} is filled per message. */
    path: string;
    example?: string;
  };
}

export const TEMPLATE_LANGUAGE = 'es';

/** The text the recipient reads, for the chat's record. */
export function renderTemplate(template: WhatsappTemplate, params: string[]): string {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');
}

/** What the Business Management API takes to create it. */
export function templateDefinition(template: WhatsappTemplate, siteUrl: string) {
  const url = `${siteUrl.replace(/\/$/, '')}${template.button.path}`;
  return {
    name: template.name,
    language: TEMPLATE_LANGUAGE,
    category: 'UTILITY',
    components: [
      ...(template.example.length > 0
        ? [{ type: 'BODY', text: template.body, example: { body_text: [template.example] } }]
        : [{ type: 'BODY', text: template.body }]),
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: template.button.text,
            url,
            ...(template.button.example
              ? { example: [url.replace('{{1}}', template.button.example)] }
              : {}),
          },
        ],
      },
    ],
  };
}
