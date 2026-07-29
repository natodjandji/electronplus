import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** Firestore doc at purchase_orders/{orderId}/purchaseOrderPayments/{id}. */
export interface PurchaseOrderPayment extends FirestoreDoc {
  amount: number;
  method: string;
  reference?: string;
  paidAt: Date;
  registeredByUserId: string;
}
