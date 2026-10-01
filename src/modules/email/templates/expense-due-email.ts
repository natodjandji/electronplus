import { ExpenseDueStatus } from '../../expenses/entities/expense.entity';
import { escapeHtml } from '../html-escape';
import { badge, button, emailLayout, eyebrow, heading } from './base-layout';

export function expenseDueEmail(
  payload: {
    name: string;
    dueStatus: ExpenseDueStatus.DUE_SOON | ExpenseDueStatus.OVERDUE;
    dueDate: string;
  },
  siteUrl: string,
): { subject: string; html: string } {
  const isOverdue = payload.dueStatus === ExpenseDueStatus.OVERDUE;
  const title = isOverdue ? 'Gasto vencido' : 'Gasto por vencer';
  const intro = `${payload.name} vence el ${payload.dueDate}.`;

  const body = `
    ${eyebrow('Alerta de gastos')}
    ${heading(title)}
    <p style="margin:0 0 16px;">
      ${badge(isOverdue ? 'Vencido' : 'Por vencer', isOverdue ? 'danger' : 'pending')}
    </p>
    <p style="margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0;">${button('Ver gastos', `${siteUrl}/admin/expenses`)}</p>
  `;

  return {
    subject: isOverdue ? `Gasto vencido: ${payload.name}` : `Gasto por vencer: ${payload.name}`,
    html: emailLayout(intro, body, siteUrl),
  };
}
