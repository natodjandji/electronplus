import { computeQuoteTotals } from '../../quotes/quote-totals';
import { Quote, QuoteStatus } from '../../quotes/entities/quote.entity';
import { formatMoney } from '../format-money';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout } from './base-layout';

/** Mirrors frontend/src/routes/quotes.tsx's per-status copy under the quote
 * builder (lines ~630-670) — same wording, translated to email. */
export function quoteStatusEmail(
  quote: Quote,
  siteUrl: string,
): { subject: string; html: string } | undefined {
  if (quote.status !== QuoteStatus.APPROVED && quote.status !== QuoteStatus.REJECTED) {
    return undefined;
  }

  const { lines, total } = computeQuoteTotals(quote);
  const itemRows = lines
    .map((line) => {
      const item = quote.items.find((i) => i.id === line.id)!;
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;">
          <tr>
            <td style="padding:12px 14px;">
              <div style="font-weight:bold;color:#0b2545;font-size:14px;">${escapeHtml(item.name)}</div>
              <div style="color:#6b7280;font-size:12px;margin-top:2px;">${escapeHtml(item.sku)} · Cantidad: ${item.qty}</div>
            </td>
            <td align="right" style="padding:12px 14px;white-space:nowrap;font-weight:bold;color:#0b2545;font-size:14px;">
              ${formatMoney(line.lineTotal)}
            </td>
          </tr>
        </table>`;
    })
    .join('');

  const isApproved = quote.status === QuoteStatus.APPROVED;

  const heading = isApproved ? 'Cotización aprobada' : 'Cotización rechazada';
  const badgeHtml = isApproved
    ? badge('Aprobada', '#d1fae5', '#047857')
    : badge('Rechazada', '#fee2e2', '#b91c1c');

  const previewText = isApproved
    ? `Tu cotización fue aprobada${quote.globalDiscountPct > 0 ? ` con un ${quote.globalDiscountPct}% de descuento especial` : ''}.`
    : `Tu solicitud de cotización fue rechazada.${quote.rejectionReason ? ` Motivo: ${quote.rejectionReason}` : ''}`;

  const intro = isApproved
    ? `Tu cotización fue aprobada${
        quote.globalDiscountPct > 0
          ? ` con un descuento especial del <b>${quote.globalDiscountPct}%</b>`
          : ''
      }. Cuando estés listo, continúa al pago con el precio y descuento acordados.`
    : `Tu solicitud de cotización fue rechazada.${
        quote.rejectionReason ? ` Motivo: ${escapeHtml(quote.rejectionReason)}` : ''
      } Si tienes dudas, respóndenos este correo.`;

  const cta = isApproved
    ? button('Continuar al pago', `${siteUrl}/checkout?quoteId=${quote.id}`)
    : button('Ver mis cotizaciones', `${siteUrl}/quotes`);

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Actualización de tu cotización</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">${heading}</h1>
    <p style="margin:0 0 16px;">${badgeHtml}</p>
    <p style="margin:0 0 24px;">${intro}</p>

    ${itemRows}

    ${
      isApproved
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <tr>
              <td style="padding:4px 0;color:#0b2545;font-size:15px;font-weight:bold;">Total</td>
              <td align="right" style="padding:4px 0;color:#0b2545;font-size:15px;font-weight:bold;">${formatMoney(total)}</td>
            </tr>
          </table>`
        : ''
    }

    <p style="margin:28px 0 0;">${cta}</p>
  `;

  return {
    subject: isApproved ? 'Tu cotización fue aprobada' : 'Tu cotización fue rechazada',
    html: emailLayout(previewText, body),
  };
}
