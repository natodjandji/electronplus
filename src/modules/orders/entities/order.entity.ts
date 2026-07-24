import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export enum OrderStatus {
  PENDING_PAYMENT_VERIFICATION = 'pending_payment_verification',
  PAID = 'paid',
  PREPARING = 'preparing',
  SHIPPED = 'shipped',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

/** Linear post-payment fulfillment pipeline — advanceStatus() steps through
 * these in order; pending-verification and cancelled sit outside it. */
export const ORDER_FULFILLMENT_PIPELINE = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.FULFILLED,
];

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  categoryLabel: string;
  qty: number;
  unitPrice: number;
  /** Snapshot of the product's cost at sale time — keeps historical margin reporting accurate even if cost changes later. */
  unitCost?: number;
  lineTotal: number;
}

export interface Order extends FirestoreDoc {
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  /** Sum of line totals before tax, shipping and discount. */
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discountCode?: string;
  discountAmount: number;
  /** subtotal - discountAmount + taxAmount + shippingCost — the amount actually charged. */
  totalAmount: number;

  shippingFullName: string;
  shippingPhone: string;
  shippingTaxId?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;

  items: OrderItem[];

  /** Set when this order was checked out from an approved quote — its item
   * prices came from the quote's negotiated discount, not standard pricing. */
  quoteId?: string;

  erpExportedAt?: Date;
  erpExportError?: string;
}
