import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export interface PurchaseOrderItem {
  productId: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  unitCost: number;
  /** Percentage (0-100) discount applied to this line only. */
  discountPerItem: number;
  /** (unitCost * quantityOrdered) * (1 - discountPerItem / 100) */
  subtotal: number;
}

export interface PurchaseOrderTotals {
  subtotal: number;
  totalDiscount: number;
  totalAmount: number;
}

export interface PurchaseOrderPaymentDetails {
  paidAt: Date;
  method: string;
  reference?: string;
}

export interface PurchaseOrder extends FirestoreDoc {
  supplierId?: string;
  supplierName: string;

  items: PurchaseOrderItem[];
  /** Percentage (0-100) discount applied on top of the line-discounted subtotal. */
  globalDiscount: number;
  totals: PurchaseOrderTotals;

  paymentTerms?: string;
  notes?: string;

  status: PurchaseOrderStatus;
  amountPaid: number;
  paymentDetails?: PurchaseOrderPaymentDetails;

  /** Which warehouse receives the stock when the order is fully paid. */
  warehouseId?: string;
  /** suppliers_payables/{id} created when the order is issued, kept in sync as payments are registered. */
  linkedPayableId?: string;

  issuedAt?: Date;
  cancelledAt?: Date;
  createdBy: string;
}
