import { EMAIL_COLORS as C } from '../brand';
import { escapeHtml } from '../html-escape';
import { button, emailLayout, eyebrow, heading } from './base-layout';

export function welcomeEmail(
  displayName: string | undefined,
  siteUrl: string,
): { subject: string; html: string } {
  const name = displayName?.trim() || 'cliente';
  const body = `
    ${eyebrow('Bienvenido')}
    ${heading(`¡Hola, ${escapeHtml(name)}!`)}
    <p style="margin:0 0 16px;">
      Gracias por crear tu cuenta en <strong>Electron Plus</strong>. Ya puedes cotizar, comprar y
      llevar el seguimiento de tus pedidos desde tu panel — con precios detal y mayorista, y
      despacho a nivel nacional.
    </p>
    <p style="margin:28px 0;">${button('Ver catálogo', `${siteUrl}/catalog`)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid ${C.border};">
      <tr>
        <td style="padding-top:16px;color:${C.muted};font-size:13px;">
          Si tienes cualquier duda, responde directo a este correo — te leemos.
        </td>
      </tr>
    </table>
  `;
  return {
    subject: '¡Bienvenido a Electron Plus!',
    html: emailLayout('Tu cuenta en Electron Plus ya está lista.', body, siteUrl),
  };
}
