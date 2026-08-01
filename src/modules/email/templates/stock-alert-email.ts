import { StockAlertLevel } from '../../inventory/entities/stock-alert.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout } from './base-layout';

export function stockAlertEmail(
  payload: { sku: string; name: string; level: StockAlertLevel; stock: number },
  siteUrl: string,
): { subject: string; html: string } {
  const isOut = payload.level === StockAlertLevel.OUT;
  const heading = isOut ? 'Producto agotado' : 'Stock bajo';
  const intro = isOut
    ? `"${payload.name}" (${payload.sku}) se quedó sin unidades disponibles.`
    : `"${payload.name}" (${payload.sku}) tiene solo ${payload.stock} unidad(es) disponible(s).`;

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Alerta de inventario</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">${heading}</h1>
    <p style="margin:0 0 16px;">
      ${badge(isOut ? 'Agotado' : 'Bajo', isOut ? '#fee2e2' : '#fdf1d3', isOut ? '#b91c1c' : '#0b2545')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver alertas de stock', `${siteUrl}/admin/stock`)}</p>
  `;

  return {
    subject: isOut ? `Agotado: ${payload.name}` : `Stock bajo: ${payload.name}`,
    html: emailLayout(intro, body),
  };
}
