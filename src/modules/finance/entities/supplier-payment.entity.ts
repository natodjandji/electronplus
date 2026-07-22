import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** Firestore doc at suppliers_payables/{invoiceId}/payments/{id}. */
export interface SupplierPayment extends FirestoreDoc {
  amount: number;
  paidAt: Date;
  method: string; // transferencia / efectivo / etc — free text, this is A/P not the storefront's A/R
  reference?: string;
  registeredByUserId: string;
}
