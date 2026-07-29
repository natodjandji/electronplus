import { escapeHtml } from '../html-escape';
import { button, emailLayout } from './base-layout';

export function welcomeEmail(
  displayName: string | undefined,
  siteUrl: string,
): { subject: string; html: string } {
  const name = displayName?.trim() || 'cliente';
  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Bienvenido</div>
    <h1 style="font-size:22px;margin:0 0 16px;color:#0b2545;">¡Hola, ${escapeHtml(name)}!</h1>
    <p style="margin:0 0 16px;">
      Gracias por crear tu cuenta en <strong>Electron Plus</strong>. Ya puedes cotizar, comprar y
      llevar el seguimiento de tus pedidos desde tu panel — con precios detal y mayorista, y
      despacho a nivel nacional.
    </p>
    <p style="margin:28px 0;">${button('Ver catálogo', `${siteUrl}/catalog`)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;color:#6b7280;font-size:13px;">
          Si tienes cualquier duda, responde directo a este correo — te leemos.
        </td>
      </tr>
    </table>
  `;
  return {
    subject: '¡Bienvenido a Electron Plus!',
    html: emailLayout('Tu cuenta en Electron Plus ya está lista.', body),
  };
}
