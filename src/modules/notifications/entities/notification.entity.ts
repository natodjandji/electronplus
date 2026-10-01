import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { Role } from '../../../common/enums/role.enum';

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  INVOICE_DUE_SOON = 'invoice_due_soon',
  INVOICE_OVERDUE = 'invoice_overdue',
  EXPENSE_DUE_SOON = 'expense_due_soon',
  EXPENSE_OVERDUE = 'expense_overdue',
  SYNC_ERROR = 'sync_error',
}

export interface Notification extends FirestoreDoc {
  type: NotificationType;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  targetRoles: Role[];
  read: boolean;
}
