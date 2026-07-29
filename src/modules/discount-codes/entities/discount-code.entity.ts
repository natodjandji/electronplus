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
}
