import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

/** Doc id is the code itself, uppercased. */
export interface DiscountCode extends FirestoreDoc {
  code: string;
  type: DiscountType;
  value: number;
  enabled: boolean;
  /** Last day it can be used (YYYY-MM-DD, Venezuela time). Unset or null: no expiry. */
  expiresOn?: string | null;
  /** Orders it can be used on in total. Unset or null: unlimited. */
  maxUses?: number | null;
  /** Orders placed with it — counted at checkout, given back when the
   * order is cancelled. */
  usedCount?: number;
}
