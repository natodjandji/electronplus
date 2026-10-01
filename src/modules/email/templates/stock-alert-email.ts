import { StockAlertLevel } from '../../inventory/entities/stock-alert.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout, eyebrow, heading } from './base-layout';

export function stockAlertEmail(
  payload: { sku: string; name: string; level: StockAlertLevel; stock: number },
  siteUrl: string,
): { subject: string; html: string } {
  const isOut = payload.level === StockAlertLevel.OUT;
  const title = isOut ? 'Producto agotado' : 'Stock bajo';
  const intro = isOut
    ? `"${payload.name}" (${payload.sku}) se quedó sin unidades disponibles.`
    : `"${payload.name}" (${payload.sku}) tiene solo ${payload.stock} unidad(es) disponible(s).`;

  const body = `
    ${eyebrow('Alerta de inventario')}
    ${heading(title)}
    <p style="margin:0 0 16px;">
      ${badge(isOut ? 'Agotado' : 'Bajo', isOut ? 'danger' : 'pending')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver alertas de stock', `${siteUrl}/admin/stock`)}</p>
  `;

  return {
    subject: isOut ? `Agotado: ${payload.name}` : `Stock bajo: ${payload.name}`,
    html: emailLayout(intro, body, siteUrl),
  };
}
