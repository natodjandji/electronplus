import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface QuoteItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  /** Snapshot of the retail unit price at the moment the item was added. */
  unitPrice: number;
  discountPct: number;
}

export interface Quote extends FirestoreDoc {
  userId: string;
  customerName: string;
  customerTaxId?: string;
  status: QuoteStatus;
  /** Set by an admin when approving (or at any point before a final decision) — the "special discount". */
  globalDiscountPct: number;
  rejectionReason?: string;
  items: QuoteItem[];
}
