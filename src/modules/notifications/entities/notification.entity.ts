import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { Role } from '../../../common/enums/role.enum';
import type { ErpSyncErrorKind } from '../../erp-sync/sync.service';

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  INVOICE_DUE_SOON = 'invoice_due_soon',
  INVOICE_OVERDUE = 'invoice_overdue',
  EXPENSE_DUE_SOON = 'expense_due_soon',
  EXPENSE_OVERDUE = 'expense_overdue',
  SYNC_ERROR = 'sync_error',
  /** The WhatsApp/Instagram assistant handed a chat to the staff. */
  CHAT_HANDOFF = 'chat_handoff',
}

export interface Notification extends FirestoreDoc {
  type: NotificationType;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  targetRoles: Role[];
  read: boolean;
  // Sync errors come in runs (the bridge down fails every sync until it's
  // back), so each kind of problem gets one notification per store day,
  // id `sync-error-<kind>-<day>`, that counts its repeats and goes away
  // once it's fixed (see NotificationsService). Older ones have none of
  // these fields.
  syncErrorKind?: ErpSyncErrorKind;
  /** The store day, YYYY-MM-DD. */
  day?: string;
  occurrences?: number;
  lastOccurredAt?: Date;
  /** Exports: the sales still not in Profit Plus. */
  orderIds?: string[];
}
