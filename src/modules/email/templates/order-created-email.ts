import { Order } from '../../orders/entities/order.entity';
import { formatMoney } from '../format-money';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout } from './base-layout';

export function orderCreatedEmail(
  order: Order,
  siteUrl: string,
): { subject: string; html: string } {
  const itemCards = order.items
    .map(
      (item) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;">
          <tr>
            <td style="padding:12px 14px;">
              <div style="font-weight:bold;color:#0b2545;font-size:14px;">${escapeHtml(item.name)}</div>
              <div style="color:#6b7280;font-size:12px;margin-top:2px;">${escapeHtml(item.sku)} · Cantidad: ${item.qty}</div>
            </td>
            <td align="right" style="padding:12px 14px;white-space:nowrap;font-weight:bold;color:#0b2545;font-size:14px;">
              ${formatMoney(item.lineTotal)}
            </td>
          </tr>
        </table>`,
    )
    .join('');

  const summaryRow = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:4px 0;color:${bold ? '#0b2545' : '#6b7280'};font-size:${bold ? '15px' : '13px'};font-weight:${bold ? 'bold' : 'normal'};">${label}</td>
      <td align="right" style="padding:4px 0;color:${bold ? '#0b2545' : '#6b7280'};font-size:${bold ? '15px' : '13px'};font-weight:${bold ? 'bold' : 'normal'};">${value}</td>
    </tr>`;

  const summaryHtml =
    summaryRow('Subtotal', formatMoney(order.subtotal)) +
    (order.discountAmount > 0
      ? summaryRow(
          `Descuento${order.discountCode ? ` (${escapeHtml(order.discountCode)})` : ''}`,
          `-${formatMoney(order.discountAmount)}`,
        )
      : '') +
    summaryRow('IVA (16%)', formatMoney(order.taxAmount)) +
    summaryRow('Envío', order.shippingCost > 0 ? formatMoney(order.shippingCost) : 'Gratis') +
    summaryRow('Total', formatMoney(order.totalAmount), true);

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Pedido recibido</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">¡Gracias por tu compra!</h1>
    <p style="margin:0 0 8px;">${badge('Procesando pago', '#fdf1d3', '#0b2545')}</p>
    <p style="margin:16px 0 24px;">Recibimos tu pedido y ya lo estamos procesando. Te avisaremos por aquí a medida que avance.</p>

    ${itemCards}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px solid #e5e7eb;">
      ${summaryHtml}
    </table>

    <p style="margin:28px 0 0;">${button('Ver mis pedidos', `${siteUrl}/client/orders`)}</p>
  `;
  return {
    subject: `Pedido recibido · ${formatMoney(order.totalAmount)}`,
    html: emailLayout('Recibimos tu pedido y ya lo estamos procesando.', body),
  };
}
