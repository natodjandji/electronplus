import { OrderStatus } from '../../orders/entities/order.entity';
import { badge, button, emailLayout, eyebrow, heading } from './base-layout';

interface StatusCopy {
  subject: string;
  heading: string;
  body: string;
  badgeLabel: string;
  badgeTone: Parameters<typeof badge>[1];
}

// Mirrors frontend/src/components/order-stepper.tsx's ORDER_STATUS_LABEL /
// ORDER_STATUS_BADGE — same labels and the same badge tones (brand-blue,
// emerald, destructive; see EMAIL_COLORS.badge). PENDING_PAYMENT_
// VERIFICATION is covered by the order-created email instead.
const STATUS_COPY: Partial<Record<OrderStatus, StatusCopy>> = {
  [OrderStatus.PAID]: {
    subject: 'Confirmamos tu pago',
    heading: '¡Pago confirmado!',
    body: 'Recibimos tu pago y ya estamos preparando tu pedido.',
    badgeLabel: 'Pagado',
    badgeTone: 'info',
  },
  [OrderStatus.PREPARING]: {
    subject: 'Tu pedido está en preparación',
    heading: 'Preparando tu pedido',
    body: 'Estamos alistando tus productos en el depósito.',
    badgeLabel: 'Preparando',
    badgeTone: 'info',
  },
  [OrderStatus.SHIPPED]: {
    subject: 'Tu pedido fue despachado',
    heading: '¡Tu pedido va en camino!',
    body: 'Tu pedido salió de nuestro depósito y está en camino a tu dirección.',
    badgeLabel: 'Enviado',
    badgeTone: 'info',
  },
  [OrderStatus.READY_FOR_PICKUP]: {
    subject: 'Tu pedido está listo para retirar',
    heading: 'Listo para retirar',
    body: 'Ya puedes pasar a retirar tu pedido en nuestro depósito.',
    badgeLabel: 'Listo para retirar',
    badgeTone: 'info',
  },
  [OrderStatus.FULFILLED]: {
    subject: '¡Tu pedido fue entregado!',
    heading: 'Entregado',
    body: 'Confirmamos la entrega de tu pedido. ¡Gracias por comprar en Electron Plus!',
    badgeLabel: 'Entregado',
    badgeTone: 'success',
  },
  [OrderStatus.CANCELLED]: {
    subject: 'Tu pedido fue cancelado',
    heading: 'Pedido cancelado',
    body: 'Tu pedido fue cancelado y, si aplicaba, el stock reservado ya fue liberado. Si tienes dudas, respóndenos este correo.',
    badgeLabel: 'Cancelado',
    badgeTone: 'danger',
  },
};

export function orderStatusEmail(
  status: OrderStatus,
  siteUrl: string,
): { subject: string; html: string } | undefined {
  const copy = STATUS_COPY[status];
  if (!copy) return undefined;

  const body = `
    ${eyebrow('Actualización de tu pedido')}
    ${heading(copy.heading)}
    <p style="margin:0 0 16px;">${badge(copy.badgeLabel, copy.badgeTone)}</p>
    <p style="margin:0 0 28px;">${copy.body}</p>
    <p style="margin:0;">${button('Ver mis pedidos', `${siteUrl}/client/orders`)}</p>
  `;
  return { subject: copy.subject, html: emailLayout(copy.body, body, siteUrl) };
}
