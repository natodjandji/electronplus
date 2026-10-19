import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAGO_MOVIL = 'pago_movil',
  CASH = 'cash',
  ZELLE = 'zelle',
  PAYPAL = 'paypal',
  CREDIT_B2B = 'credit_b2b',
  /** Buy now, pay in installments: Cashea finances the purchase once the
   * store confirms the customer's down payment (see CasheaPayment). */
  CASHEA = 'cashea',
  // Catch-all for any payment channel an admin adds via the payment-methods
  // panel beyond the built-in ones above — those are all reconciled by an
  // admin against a reference/proof the same way, so they don't each need
  // their own enum member.
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/** Methods reconciled by an admin against a bank/wallet reference, vs. PayPal which confirms itself via its API. */
export const MANUAL_RECONCILIATION_METHODS = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.PAGO_MOVIL,
  PaymentMethod.CASH,
  PaymentMethod.ZELLE,
  PaymentMethod.OTHER,
];

/** The down payment ("inicial") a Cashea buyer reports: paid online
 * through one of the store's payment methods, or to be paid at the store
 * when picking the order up. */
export type CasheaDownPayment =
  | {
      atStore: false;
      /** The payment-methods panel entry it was paid through. */
      methodId: string;
      methodLabel: string;
      amount: number;
      reference?: string;
      proofUrl?: string;
      reportedAt: string;
    }
  | { atStore: true; reportedAt: string };

/** A Cashea payment's progress. Times are ISO strings: Firestore hands
 * nested Dates back as Timestamps, which don't serialize. */
export interface CasheaPayment {
  /** Cashea's id for the checkout this store created. */
  payloadId: number;
  /** Where the buyer completes it on Cashea's site (log in, pick a plan). */
  checkoutUrl: string;
  /** The total Cashea finances, from the lines it was sent; it can differ
   * from the order total by a few cents of per-unit rounding. */
  total: number;
  /** Cashea's order number, set when the buyer comes back approved. */
  orderId?: string;
  returnedAt?: string;
  downPayment?: CasheaDownPayment;
  /** The down payment confirmed to Cashea: the order is paid from here. */
  confirmedAmount?: number;
  confirmedAt?: string;
  /** Cancelled at Cashea, or why it couldn't be. */
  cancelledAt?: string;
  cancelError?: string;
}

export interface Payment extends FirestoreDoc {
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  reference?: string; // bank/pago-móvil/zelle confirmation reference
  proofUrl?: string;
  externalReference?: string; // PayPal order id
  /** PayPal's id for the charge — how it's found in the PayPal dashboard. */
  paypalCaptureId?: string;
  /** Set when PayPal took the money but didn't confirm it for this order —
   * the charge is still under review at PayPal, or it doesn't match the
   * order's amount. The payment stays pending until an admin checks PayPal
   * and verifies or rejects it by hand. */
  paypalReview?: { status: string; amount: number; currency: string };
  verifiedByUserId?: string;
  verifiedAt?: Date;
  rejectionReason?: string;
  cashea?: CasheaPayment;
}
