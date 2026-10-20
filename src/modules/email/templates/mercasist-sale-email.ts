import { formatMoney } from '../format-money';
import { escapeHtml } from '../html-escape';
import { EMAIL_COLORS as C } from '../brand';
import { badge, button, emailLayout, eyebrow, heading, summaryTable } from './base-layout';

type Tone = 'info' | 'pending' | 'success' | 'danger';

/** Mercasist's order statuses are free text ("Abierta", "Pago recibido",
 * "Enviada", "Entregada", "Finalizada"…): toned by what they say. */
function tone(status: string): Tone {
  if (/cancel|anulad|rechaz/i.test(status)) return 'danger';
  if (/pago recibido|pagad|entregad|finalizad/i.test(status)) return 'success';
  if (/abiert|pendiente/i.test(status)) return 'pending';
  return 'info';
}

/** Plain text; escape it where it goes into HTML. */
function amount(value: number, currency: string): string {
  return currency === 'USD'
    ? formatMoney(value)
    : `Bs ${value.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
}

/** One sold line, like base-layout's itemCard but in the sale's currency. */
function lineCard(item: { name: string; sku: string; qty: number }, total: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;margin-bottom:10px;">
      <tr>
        <td style="padding:12px 14px;">
          <div style="font-weight:700;color:${C.navy};font-size:14px;">${escapeHtml(item.name)}</div>
          <div style="color:${C.muted};font-size:12px;margin-top:2px;">${escapeHtml(item.sku)} · Cantidad: ${item.qty}</div>
        </td>
        <td align="right" style="padding:12px 14px;white-space:nowrap;font-weight:700;color:${C.navy};font-size:14px;">${total}</td>
      </tr>
    </table>`;
}

/** Sent to every admin when a Mercado Libre sale shows up in Mercasist.
 * The stock isn't touched here: it moves when the sale is invoiced in
 * Profit, so the email says so. */
export function mercasistSaleEmail(
  sale: {
    id: string;
    idMl: string | null;
    status: string;
    total: number;
    currency: string;
    buyer?: string;
    items: { title: string; qty: number; unitPrice: number; sku?: string }[];
  },
  siteUrl: string,
): { subject: string; html: string } {
  const units = sale.items.reduce((sum, line) => sum + line.qty, 0);
  const cards = sale.items
    .map((line) =>
      lineCard(
        { name: line.title, sku: line.sku ?? 'Sin SKU', qty: line.qty },
        escapeHtml(amount(line.unitPrice * line.qty, sale.currency)),
      ),
    )
    .join('');
  const mlLink = sale.idMl
    ? `<p style="margin:24px 0 12px;">${button(
        'Ver la venta en Mercado Libre',
        `https://www.mercadolibre.com.ve/ventas/${encodeURIComponent(sale.idMl)}/detalle`,
      )}</p>`
    : '';

  const body = `
    ${eyebrow('Venta en Mercado Libre')}
    ${heading(`Pedido #${escapeHtml(sale.idMl ?? sale.id)}`)}
    <p style="margin:0 0 20px;">${badge(escapeHtml(sale.status), tone(sale.status))}</p>
    <p style="margin:0 0 20px;">${
      sale.buyer
        ? `Comprador: <strong style="color:${C.navy};">${escapeHtml(sale.buyer)}</strong>. `
        : ''
    }Atiéndela en Mercasist o en Mercado Libre y factura la venta en Profit: así baja el stock en Profit, en la web y en Mercado Libre.</p>
    ${cards}
    ${summaryTable([{ label: 'Total', value: escapeHtml(amount(sale.total, sale.currency)), emphasis: true }])}
    ${mlLink}
    <p style="margin:${mlLink ? '0' : '24px 0 0'};font-size:13px;color:${C.muted};">También aparece en <a href="${escapeHtml(`${siteUrl}/admin/mercasist`)}" style="color:${C.blue};text-decoration:underline;">Mercado Libre</a> en el panel.</p>
  `;

  const first = sale.items[0]?.title ?? 'productos';
  const what = sale.items.length > 1 ? `${first} y ${sale.items.length - 1} más` : first;
  return {
    subject: `Venta en Mercado Libre: ${what} (${units} ${units === 1 ? 'unidad' : 'unidades'})`,
    html: emailLayout(`${sale.status} · ${amount(sale.total, sale.currency)}`, body, siteUrl),
  };
}
