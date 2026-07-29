import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAGO_MOVIL = 'pago_movil',
  CASH = 'cash',
  ZELLE = 'zelle',
  PAYPAL = 'paypal',
  CREDIT_B2B = 'credit_b2b',
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

export interface Payment extends FirestoreDoc {
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  reference?: string; // bank/pago-móvil/zelle confirmation reference
  proofUrl?: string;
  externalReference?: string; // PayPal order id
  verifiedByUserId?: string;
  verifiedAt?: Date;
  rejectionReason?: string;
}
