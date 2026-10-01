import { Order } from '../../orders/entities/order.entity';
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

export function orderCreatedEmail(
  order: Order,
  siteUrl: string,
): { subject: string; html: string } {
  const itemCards = order.items.map((item) => itemCard(item, item.lineTotal)).join('');

  const summary = summaryTable([
    { label: 'Subtotal', value: formatMoney(order.subtotal) },
    ...(order.discountAmount > 0
      ? [
          {
            label: `Descuento${order.discountCode ? ` (${escapeHtml(order.discountCode)})` : ''}`,
            value: `-${formatMoney(order.discountAmount)}`,
          },
        ]
      : []),
    { label: 'IVA (16%)', value: formatMoney(order.taxAmount) },
    { label: 'Envío', value: order.shippingCost > 0 ? formatMoney(order.shippingCost) : 'Gratis' },
    { label: 'Total', value: formatMoney(order.totalAmount), emphasis: true },
  ]);

  const body = `
    ${eyebrow('Pedido recibido')}
    ${heading('¡Gracias por tu compra!')}
    <p style="margin:0 0 8px;">${badge('Procesando pago', 'pending')}</p>
    <p style="margin:16px 0 24px;">Recibimos tu pedido y ya lo estamos procesando. Te avisaremos por aquí a medida que avance.</p>

    ${itemCards}
    ${summary}

    <p style="margin:28px 0 0;">${button('Ver mis pedidos', `${siteUrl}/client/orders`)}</p>
  `;
  return {
    subject: `Pedido recibido · ${formatMoney(order.totalAmount)}`,
    html: emailLayout('Recibimos tu pedido y ya lo estamos procesando.', body, siteUrl),
  };
}
