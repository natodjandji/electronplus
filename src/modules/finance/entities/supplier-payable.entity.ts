import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum SupplierPayableStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

/** Urgency indicator layered on top of `status` while it's still `pending`. */
export enum PayableDueStatus {
  CURRENT = 'current',
  DUE_SOON = 'due_soon',
  OVERDUE = 'overdue',
}

/** Firestore doc at suppliers_payables/{id}. */
export interface SupplierPayable extends FirestoreDoc {
  supplierId?: string;
  supplierName: string;
  invoiceNumber: string;
  amount: number;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: SupplierPayableStatus;
  dueStatus: PayableDueStatus;
  amountPaid: number;
  paymentTerms?: string;
  notes?: string;
}
