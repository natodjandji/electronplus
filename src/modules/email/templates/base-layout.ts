import { BRAND_CID } from '../brand-assets';
import { EMAIL_COLORS as C, EMAIL_CONTACT, EMAIL_FONT_STACK, emailFontUrl } from '../brand';
import { escapeHtml } from '../html-escape';
import { formatMoney } from '../format-money';

type Tone = keyof typeof C.badge;

/** Shared wrapper for every transactional email. Mirrors the storefront
 * (site-footer.tsx and the hero): brand-blue header with the white logo, a
 * yellow accent rule, a white card body, and the same brand-blue footer —
 * logo, tagline, TIENDA / CONTACTO columns with yellow titles, copyright.
 *
 * Table layout with inline styles, since that's what survives across email
 * clients (Outlook renders with Word's engine). The <style> block only adds
 * progressive enhancement: the Geomini web font and stacking the footer
 * columns on narrow screens — clients that ignore it still get a complete,
 * correct email. */
export function emailLayout(previewText: string, bodyHtml: string, siteUrl: string): string {
  const year = new Date().getFullYear();
  const link = (label: string, path: string) =>
    `<a href="${siteUrl}${path}" style="color:${C.onBlueSoft};text-decoration:none;">${label}</a>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      @font-face {
        font-family: 'Geomini';
        src: url('${emailFontUrl(siteUrl)}') format('woff2');
        font-weight: 200 800;
        font-style: normal;
      }
      @media only screen and (max-width: 480px) {
        .px { padding-left: 20px !important; padding-right: 20px !important; }
        .col { display: block !important; width: 100% !important; padding: 0 0 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${C.surface};font-family:${EMAIL_FONT_STACK};color:${C.navy};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.surface};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${C.white};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">

            <!-- header: the storefront hero's brand blue + white logo -->
            <tr>
              <td class="px" bgcolor="${C.blue}" style="background-color:${C.blue};padding:28px 36px;">
                <a href="${siteUrl}" style="text-decoration:none;">
                  <img src="cid:${BRAND_CID.logoHeader}" alt="Electron Plus" height="30" style="display:block;height:30px;width:auto;border:0;" />
                </a>
              </td>
            </tr>
            <tr>
              <td bgcolor="${C.yellow}" style="background-color:${C.yellow};height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>

            <!-- body -->
            <tr>
              <td class="px" style="padding:36px;color:${C.navy};font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- footer: mirrors site-footer.tsx -->
            <tr>
              <td class="px" bgcolor="${C.blue}" style="background-color:${C.blue};padding:32px 36px 0;">
                <img src="cid:${BRAND_CID.logoHeader}" alt="Electron Plus" height="30" style="display:block;height:30px;width:auto;border:0;" />
                <p style="margin:14px 0 24px;max-width:400px;color:${C.onBlueSoft};font-size:13px;line-height:1.6;">
                  Tu proveedor confiable de iluminación, cables y materiales eléctricos. Atención detal, mayorista y proyectos.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="col" width="50%" valign="top" style="padding-right:16px;">
                      <div style="color:${C.yellow};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 10px;">Tienda</div>
                      <div style="font-size:13px;line-height:2;">
                        ${link('Catálogo', '/catalog')}<br/>
                        ${link('Colecciones', '/collections')}<br/>
                        ${link('Cotizaciones', '/quotes')}<br/>
                        ${link('Pedidos', '/client/orders')}
                      </div>
                    </td>
                    <td class="col" width="50%" valign="top">
                      <div style="color:${C.yellow};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 10px;">Contacto</div>
                      <div style="font-size:13px;line-height:2;color:${C.onBlueSoft};">
                        <a href="${EMAIL_CONTACT.whatsappHref}" style="color:${C.onBlueSoft};text-decoration:none;"><img src="cid:${BRAND_CID.whatsappFooter}" alt="" width="14" height="14" style="vertical-align:-2px;border:0;margin-right:6px;" />${EMAIL_CONTACT.phone}</a><br/>
                        <a href="mailto:${EMAIL_CONTACT.email}" style="color:${C.onBlueSoft};text-decoration:none;">${EMAIL_CONTACT.email}</a><br/>
                        ${EMAIL_CONTACT.hours}
                      </div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid ${C.onBlueLine};">
                  <tr>
                    <td align="center" style="padding:16px 0 20px;color:${C.onBlueFaint};font-size:11px;">
                      © ${year} Electron Plus. Todos los derechos reservados.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Primary action — the storefront's default Button (brand blue, white
 * text, rounded). The colored <td> keeps the button visible in clients
 * (Outlook) that drop padding on <a>. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.blue}" style="background-color:${C.blue};border-radius:8px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;color:${C.white};font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;text-decoration:none;">${label}</a></td></tr></table>`;
}

/** Status pill, same pairs as the site's ORDER_STATUS_BADGE. */
export function badge(label: string, tone: Tone): string {
  const { bg, fg } = C.badge[tone];
  return `<span style="display:inline-block;background-color:${bg};color:${fg};font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;">${label}</span>`;
}

/** Section label above a heading — text-xs font-semibold uppercase
 * tracking-widest text-brand-blue on the site. */
export function eyebrow(text: string): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.blue};margin:0 0 8px;">${text}</div>`;
}

export function heading(text: string): string {
  return `<h1 style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;margin:0 0 12px;color:${C.navy};">${text}</h1>`;
}

/** One product line, styled like the cart/checkout cards. */
export function itemCard(item: { name: string; sku: string; qty: number }, total: number): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;margin-bottom:10px;">
      <tr>
        <td style="padding:12px 14px;">
          <div style="font-weight:700;color:${C.navy};font-size:14px;">${escapeHtml(item.name)}</div>
          <div style="color:${C.muted};font-size:12px;margin-top:2px;">${escapeHtml(item.sku)} · Cantidad: ${item.qty}</div>
        </td>
        <td align="right" style="padding:12px 14px;white-space:nowrap;font-weight:700;color:${C.navy};font-size:14px;">
          ${formatMoney(total)}
        </td>
      </tr>
    </table>`;
}

/** Label/value rows under the items; `emphasis` styles the closing Total. */
export function summaryTable(rows: { label: string; value: string; emphasis?: boolean }[]): string {
  const cells = rows
    .map(({ label, value, emphasis }) => {
      const style = emphasis
        ? `color:${C.navy};font-size:16px;font-weight:700;padding-top:10px;`
        : `color:${C.muted};font-size:13px;`;
      return `<tr><td style="padding:4px 0;${style}">${label}</td><td align="right" style="padding:4px 0;${style}">${value}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px solid ${C.border};">${cells}</table>`;
}
