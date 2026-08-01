import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum ExpenseFrequency {
  ONCE = 'once',
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
}

export enum ExpenseStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

/** Urgency indicator layered on top of `status` while it's still `pending` — same shape as finance's PayableDueStatus, kept as its own type since expenses aren't supplier payables. */
export enum ExpenseDueStatus {
  CURRENT = 'current',
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
}

/** Firestore doc at expenses/{id}. Covers both one-off expenses and
 * recurring ones (rent, subscriptions, insurance): `dueDate` always holds
 * the *next* payment date — paying a recurring expense rolls it forward
 * instead of closing it out, see ExpensesService.markPaid. */
export interface Expense extends FirestoreDoc {
  name: string;
  category: string;
  amount: number;
  frequency: ExpenseFrequency;
  dueDate: string; // YYYY-MM-DD
  status: ExpenseStatus;
  dueStatus: ExpenseDueStatus;
  lastPaidAt?: string; // YYYY-MM-DD
  notes?: string;
  // Lets a recurring expense be paused (e.g. a cancelled subscription)
  // without deleting its payment history.
  active: boolean;
}
