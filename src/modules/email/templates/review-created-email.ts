import { EMAIL_COLORS as C } from '../brand';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout, eyebrow, heading } from './base-layout';
import { STORE_TIME_ZONE } from '../../../common/utils/store-day';

const RATING_LABELS = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];

function stars(rating: number): string {
  return `<span style="color:${C.yellow};letter-spacing:2px;">${'★'.repeat(rating)}</span><span data-skip-text style="color:${C.border};letter-spacing:2px;">${'★'.repeat(5 - rating)}</span>`;
}

/** wa.me link with a greeting ready (0414-1234567 → 584141234567). */
function whatsappHref(phone: string, name?: string): string {
  const digits = `58${phone.replace(/\D/g, '').slice(1)}`;
  const text = `Hola${name ? ` ${name}` : ''}, te escribimos de Electron Plus por la reseña que nos dejaste.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:${C.muted};font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;color:${C.navy};font-size:14px;font-weight:600;">${valueHtml}</td></tr>`;
}

/** Sent to every admin when a customer leaves a review through the store's QR. */
export function reviewCreatedEmail(
  review: {
    rating: number;
    sourceLabel: string;
    sourceOther?: string;
    sellerName?: string;
    message?: string;
    customerName?: string;
    customerPhone?: string;
    createdAt: Date | string;
  },
  siteUrl: string,
): { subject: string; html: string } {
  const label = RATING_LABELS[review.rating] ?? '';
  const needsAttention = review.rating <= 2;
  const tone = needsAttention ? 'danger' : review.rating === 3 ? 'pending' : 'success';
  const toneLabel = needsAttention
    ? 'Para atender'
    : review.rating === 3
      ? 'Regular'
      : 'Satisfecho';
  const when = new Date(review.createdAt).toLocaleString('es-VE', {
    timeZone: STORE_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  const source = review.sourceOther
    ? `${escapeHtml(review.sourceLabel)} — "${escapeHtml(review.sourceOther)}"`
    : escapeHtml(review.sourceLabel);
  const rows = [
    detailRow('Cómo llegó', source),
    review.sellerName && detailRow('Lo atendió', escapeHtml(review.sellerName)),
    review.customerName && detailRow('Nombre', escapeHtml(review.customerName)),
    review.customerPhone &&
      detailRow(
        'Teléfono',
        `<a href="${whatsappHref(review.customerPhone, review.customerName)}" style="color:${C.blue};text-decoration:underline;">${escapeHtml(review.customerPhone)}</a> <span style="color:${C.muted};font-weight:400;">(WhatsApp)</span>`,
      ),
    detailRow('Fecha', escapeHtml(when)),
  ]
    .filter(Boolean)
    .join('');

  const message = review.message
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-left:3px solid ${C.yellow};background-color:${C.surface};border-radius:6px;color:${C.navy};font-size:15px;line-height:1.5;white-space:pre-line;">${escapeHtml(review.message)}</div>`
    : `<p style="margin:0 0 20px;color:${C.muted};font-size:14px;">Sin mensaje.</p>`;

  const intro = review.message
    ? `${review.rating}/5 · ${review.message}`
    : `${review.rating}/5 · Llegó por ${review.sourceOther || review.sourceLabel}`;

  const body = `
    ${eyebrow('Nueva reseña de la tienda')}
    ${heading(`${stars(review.rating)} ${label}`)}
    <p style="margin:0 0 20px;">${badge(toneLabel, tone)}</p>
    ${message}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${rows}</table>
    <p style="margin:0;">${button('Ver todas las reseñas', `${siteUrl}/admin/reviews`)}</p>
  `;

  return {
    subject: needsAttention
      ? `Reseña para atender: ${review.rating} de 5 estrellas`
      : `Nueva reseña: ${review.rating} de 5 estrellas (${label})`,
    html: emailLayout(intro, body, siteUrl, 'staff'),
  };
}
