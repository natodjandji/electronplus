/**
 * The WhatsApp template admin alerts go out with. Writing first to someone
 * who hasn't written in the last 24 hours takes an approved template, so
 * every alert uses this one: a title, a detail line, and a button to the
 * panel page it's about.
 *
 * It lives in the WhatsApp Business account of the sending number. A new
 * number in another account needs it created there too:
 *   npm run whatsapp:templates -- <WABA_ID>
 */
export const ALERT_TEMPLATE_NAME = 'alerta_panel';
export const ALERT_TEMPLATE_LANGUAGE = 'es';

/** Meta rejects template parameters with line breaks, tabs or more than
 * four spaces in a row; the body as a whole is capped at 1024 characters. */
export const ALERT_TITLE_LIMIT = 80;
export const ALERT_DETAIL_LIMIT = 700;

/** What the Business Management API takes to create the template. */
export function alertTemplateDefinition(siteUrl: string) {
  const panel = `${siteUrl.replace(/\/$/, '')}/admin/`;
  return {
    name: ALERT_TEMPLATE_NAME,
    language: ALERT_TEMPLATE_LANGUAGE,
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Alerta de Electron Plus' },
      {
        type: 'BODY',
        // Meta won't take a body that starts or ends with a parameter.
        text: 'Hay una alerta nueva en la tienda.\n\n*{{1}}*\n{{2}}\n\nPuedes verla en el panel de administración.',
        example: {
          body_text: [['Producto agotado', 'Bombillo LED 9W (LED-9W): 0 unidades disponibles']],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Abrir el panel',
            url: `${panel}{{1}}`,
            example: [`${panel}stock`],
          },
        ],
      },
    ],
  };
}
