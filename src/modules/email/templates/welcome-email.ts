import { escapeHtml } from '../html-escape';
import { button, emailLayout, eyebrow, heading } from './base-layout';

/** About the account the customer just opened, not the store's offer: a
 * welcome that sells (prices, shipping, "see the catalog") is what lands in
 * Gmail's Promotions, and teaches it to file the order emails after it there
 * too. */
export function welcomeEmail(
  displayName: string | undefined,
  siteUrl: string,
): { subject: string; html: string } {
  const name = displayName?.trim() || 'cliente';
  const body = `
    ${eyebrow('Tu cuenta')}
    ${heading(`¡Hola, ${escapeHtml(name)}!`)}
    <p style="margin:0 0 16px;">
      Tu cuenta en <strong>Electron Plus</strong> ya está lista. Desde ella puedes seguir tus
      pedidos, ver tus cotizaciones y mantener al día tus datos de envío.
    </p>
    <p style="margin:28px 0 0;">${button('Ver mi cuenta', `${siteUrl}/client/profile`)}</p>
  `;
  return {
    subject: 'Tu cuenta en Electron Plus está lista',
    html: emailLayout(
      'Ya puedes seguir tus pedidos y cotizaciones desde tu cuenta.',
      body,
      siteUrl,
    ),
  };
}
