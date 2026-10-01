import { PayableDueStatus } from '../../finance/entities/supplier-payable.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout, eyebrow, heading } from './base-layout';

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
  const title = isOverdue ? 'Factura vencida' : 'Factura por vencer';
  const intro = `${payload.supplierName} · Factura ${payload.invoiceNumber} vence el ${payload.dueDate}.`;

  const body = `
    ${eyebrow('Alerta de compras')}
    ${heading(title)}
    <p style="margin:0 0 16px;">
      ${badge(isOverdue ? 'Vencida' : 'Por vencer', isOverdue ? 'danger' : 'pending')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver compras y facturas', `${siteUrl}/admin/purchases`)}</p>
  `;

  return {
    subject: isOverdue
      ? `Factura vencida: ${payload.supplierName}`
      : `Factura por vencer: ${payload.supplierName}`,
    html: emailLayout(intro, body, siteUrl),
  };
}
