import { EMAIL_COLORS as C } from '../brand';
import { escapeHtml } from '../html-escape';
import { button, emailLayout, eyebrow, heading } from './base-layout';

/** Sent when an admin tries to give this account a staff role and its
 * email isn't verified yet (see UsersService.assertEmailVerified). */
export function verifyEmailEmail(
  displayName: string | undefined,
  verificationLink: string,
  siteUrl: string,
): { subject: string; html: string } {
  const name = displayName?.trim() || 'hola';
  const body = `
    ${eyebrow('Verifica tu correo')}
    ${heading(`${escapeHtml(name)}, confirma que este correo es tuyo`)}
    <p style="margin:0 0 16px;">
      Para darte acceso como parte del equipo de <strong>Electron Plus</strong>, necesitamos
      confirmar que este correo te pertenece.
    </p>
    <p style="margin:28px 0;">${button('Verificar mi correo', verificationLink)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid ${C.border};">
      <tr>
        <td style="padding-top:16px;color:${C.muted};font-size:13px;">
          Si no esperabas este correo, ignóralo: sin la verificación nadie recibe acceso.
        </td>
      </tr>
    </table>
  `;
  return {
    subject: 'Verifica tu correo para Electron Plus',
    html: emailLayout('Confirma tu correo para recibir acceso.', body, siteUrl),
  };
}
