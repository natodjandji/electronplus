import { computeQuoteTotals } from '../../quotes/quote-totals';
import { Quote, QuoteStatus } from '../../quotes/entities/quote.entity';
import { formatMoney } from '../format-money';
import { escapeHtml } from '../html-escape';
import {
  badge,
  button,
  emailLayout,
  eyebrow,
  heading,
  itemCard,
  summaryTable,
} from './base-layout';

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
    .map((line) =>
      itemCard(
        quote.items.find((i) => i.id === line.id)!,
        line.lineTotal,
      ),
    )
    .join('');

  const isApproved = quote.status === QuoteStatus.APPROVED;

  const title = isApproved ? 'Cotización aprobada' : 'Cotización rechazada';
  const badgeHtml = isApproved ? badge('Aprobada', 'success') : badge('Rechazada', 'danger');

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
    ${eyebrow('Actualización de tu cotización')}
    ${heading(title)}
    <p style="margin:0 0 16px;">${badgeHtml}</p>
    <p style="margin:0 0 24px;">${intro}</p>

    ${itemRows}
    ${isApproved ? summaryTable([{ label: 'Total', value: formatMoney(total), emphasis: true }]) : ''}

    <p style="margin:28px 0 0;">${cta}</p>
  `;

  return {
    subject: isApproved ? 'Tu cotización fue aprobada' : 'Tu cotización fue rechazada',
    html: emailLayout(previewText, body, siteUrl),
  };
}
