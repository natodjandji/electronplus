import { BRAND_CID } from '../brand-assets';

/** Shared wrapper for every transactional email — table-based layout with
 * inline styles throughout (not a <style> block), since that's what
 * survives across email clients (Gmail strips <style>, Outlook uses Word's
 * HTML renderer). Mirrors the storefront's actual header/footer
 * (site-header.tsx, site-footer.tsx): navy header with the real logo, a
 * yellow accent rule, and a navy footer with the isotipo + tagline +
 * contact info, instead of a generic templated look. */
export function emailLayout(previewText: string, bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0;padding:0;background-color:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(11,37,69,0.08);">

            <!-- header -->
            <tr>
              <td style="background-color:#0b2545;padding:28px 32px;">
                <img
                  src="cid:${BRAND_CID.logoHeader}"
                  alt="Electron Plus"
                  height="28"
                  style="display:block;height:28px;width:auto;border:0;"
                />
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffb703;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>

            <!-- body -->
            <tr>
              <td style="padding:36px 32px;color:#0b2545;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- footer, mirrors site-footer.tsx -->
            <tr>
              <td style="background-color:#0b2545;padding:28px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="44" valign="top" style="padding-right:14px;">
                      <img
                        src="cid:${BRAND_CID.isotipoFooter}"
                        alt=""
                        width="36"
                        style="display:block;width:36px;height:auto;border:0;"
                      />
                    </td>
                    <td valign="top">
                      <div style="color:#ffffff;font-size:13px;font-weight:bold;margin:0 0 4px;">Electron Plus</div>
                      <div style="color:#a9b4c9;font-size:12px;line-height:1.6;margin:0 0 10px;">
                        Tu proveedor confiable de iluminación, cables y materiales eléctricos.
                      </div>
                      <div style="color:#a9b4c9;font-size:12px;line-height:1.8;">
                        <a href="mailto:electronplusve@gmail.com" style="color:#ffb703;text-decoration:none;">electronplusve@gmail.com</a><br/>
                        Lun–Sáb 8am–6pm
                      </div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.12);">
                  <tr>
                    <td style="padding-top:16px;color:#7c88a3;font-size:11px;">
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

export function button(label: string, href: string): string {
  return `<a href="${href}" style="background-color:#ffb703;color:#0b2545;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">${label}</a>`;
}

/** Small colored pill, matching the site's status-badge styling
 * (order-stepper.tsx's ORDER_STATUS_BADGE) — used to echo an order's
 * current stage inside the email body. */
export function badge(label: string, bg: string, color: string): string {
  return `<span style="display:inline-block;background-color:${bg};color:${color};font-size:12px;font-weight:bold;padding:4px 12px;border-radius:999px;">${label}</span>`;
}
