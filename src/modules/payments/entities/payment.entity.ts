import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAGO_MOVIL = 'pago_movil',
  CASH = 'cash',
  ZELLE = 'zelle',
  PAYPAL = 'paypal',
  CREDIT_B2B = 'credit_b2b',
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
