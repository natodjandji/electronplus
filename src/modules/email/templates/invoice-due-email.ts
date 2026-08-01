import { PayableDueStatus } from '../../finance/entities/supplier-payable.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout } from './base-layout';

export function invoiceDueEmail(
  payload: {
    invoiceNumber: string;
    supplierName: string;
    dueStatus: PayableDueStatus.DUE_SOON | PayableDueStatus.OVERDUE;
    dueDate: string;
  },
  siteUrl: string,
): { subject: string; html: string } {
  const isOverdue = payload.dueStatus === PayableDueStatus.OVERDUE;
  const heading = isOverdue ? 'Factura vencida' : 'Factura por vencer';
  const intro = `${payload.supplierName} · Factura ${payload.invoiceNumber} vence el ${payload.dueDate}.`;

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Alerta de compras</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">${heading}</h1>
    <p style="margin:0 0 16px;">
      ${badge(isOverdue ? 'Vencida' : 'Por vencer', isOverdue ? '#fee2e2' : '#fdf1d3', isOverdue ? '#b91c1c' : '#0b2545')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver compras y facturas', `${siteUrl}/admin/purchases`)}</p>
  `;

  return {
    subject: isOverdue
      ? `Factura vencida: ${payload.supplierName}`
      : `Factura por vencer: ${payload.supplierName}`,
    html: emailLayout(intro, body),
  };
}
