import { ExpenseDueStatus } from '../../expenses/entities/expense.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout } from './base-layout';

export function expenseDueEmail(
  payload: {
    name: string;
    dueStatus: ExpenseDueStatus.DUE_SOON | ExpenseDueStatus.OVERDUE;
    dueDate: string;
  },
  siteUrl: string,
): { subject: string; html: string } {
  const isOverdue = payload.dueStatus === ExpenseDueStatus.OVERDUE;
  const heading = isOverdue ? 'Gasto vencido' : 'Gasto por vencer';
  const intro = `${payload.name} vence el ${payload.dueDate}.`;

  const body = `
    <div style="font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#0056b3;margin:0 0 8px;">Alerta de gastos</div>
    <h1 style="font-size:22px;margin:0 0 8px;color:#0b2545;">${heading}</h1>
    <p style="margin:0 0 16px;">
      ${badge(isOverdue ? 'Vencido' : 'Por vencer', isOverdue ? '#fee2e2' : '#fdf1d3', isOverdue ? '#b91c1c' : '#0b2545')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver gastos', `${siteUrl}/admin/expenses`)}</p>
  `;

  return {
    subject: isOverdue ? `Gasto vencido: ${payload.name}` : `Gasto por vencer: ${payload.name}`,
    html: emailLayout(intro, body),
  };
}
