import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export enum OrderStatus {
  PENDING_PAYMENT_VERIFICATION = 'pending_payment_verification',
  PAID = 'paid',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

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
  totalAmount: number;

  shippingFullName: string;
  shippingPhone: string;
  shippingTaxId?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;

  items: OrderItem[];

  erpExportedAt?: Date;
  erpExportError?: string;
}
