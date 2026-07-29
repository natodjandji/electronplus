import { OrderStatus } from '../../orders/entities/order.entity';
import { badge, button, emailLayout } from './base-layout';

interface StatusCopy {
  subject: string;
  heading: string;
  body: string;
  badgeLabel: string;
  badgeBg: string;
  badgeColor: string;
}

// Mirrors frontend/src/components/order-stepper.tsx's ORDER_STATUS_LABEL /
// ORDER_STATUS_BADGE — same labels and the same badge colors (brand-blue,
// emerald, destructive) translated to email-safe hex. PENDING_PAYMENT_
// VERIFICATION is covered by the order-created email instead.
const STATUS_COPY: Partial<Record<OrderStatus, StatusCopy>> = {
  [OrderStatus.PAID]: {
    subject: 'Confirmamos tu pago',
    heading: '¡Pago confirmado!',
    body: 'Recibimos tu pago y ya estamos preparando tu pedido.',
    badgeLabel: 'Pagado',
    badgeBg: '#e6f0fa',
    badgeColor: '#0056b3',
  },
  [OrderStatus.PREPARING]: {
    subject: 'Tu pedido está en preparación',
    heading: 'Preparando tu pedido',
    body: 'Estamos alistando tus productos en el depósito.',
    badgeLabel: 'Preparando',
    badgeBg: '#e6f0fa',
    badgeColor: '#0056b3',
  },
  [OrderStatus.SHIPPED]: {
    subject: 'Tu pedido fue despachado',
    heading: '¡Tu pedido va en camino!',
    body: 'Tu pedido salió de nuestro depósito y está en camino a tu dirección.',
    badgeLabel: 'Enviado',
    badgeBg: '#e6f0fa',
    badgeColor: '#0056b3',
  },
  [OrderStatus.READY_FOR_PICKUP]: {
    subject: 'Tu pedido está listo para retirar',
    heading: 'Listo para retirar',
    body: 'Ya puedes pasar a retirar tu pedido en nuestro depósito.',
    badgeLabel: 'Listo para retirar',
    badgeBg: '#e6f0fa',
    badgeColor: '#0056b3',
  },
  [OrderStatus.FULFILLED]: {
    subject: '¡Tu pedido fue entregado!',
    heading: 'Entregado',
    body: 'Confirmamos la entrega de tu pedido. ¡Gracias por comprar en Electron Plus!',
    badgeLabel: 'Entregado',
    badgeBg: '#d1fae5',
    badgeColor: '#047857',
  },
  [OrderStatus.CANCELLED]: {
    subject: 'Tu pedido fue cancelado',
    heading: 'Pedido cancelado',
    body: 'Tu pedido fue cancelado y, si aplicaba, el stock reservado ya fue liberado. Si tienes dudas, respóndenos este correo.',
    badgeLabel: 'Cancelado',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
  },
};

export function orderStatusEmail(
  status: OrderStatus,
  siteUrl: string,
): { subject: string; html: string } | undefined {
  const copy = STATUS_COPY[status];
  if (!copy) return undefined;

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Actualización de tu pedido</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">${copy.heading}</h1>
    <p style="margin:0 0 16px;">${badge(copy.badgeLabel, copy.badgeBg, copy.badgeColor)}</p>
    <p style="margin:0 0 28px;">${copy.body}</p>
    <p style="margin:0;">${button('Ver mis pedidos', `${siteUrl}/client/orders`)}</p>
  `;
  return { subject: copy.subject, html: emailLayout(copy.body, body) };
}
