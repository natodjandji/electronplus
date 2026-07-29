import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** A shipping cost for a state/city pair. city === "*" means "rest of the state" (used as a fallback when no exact city match exists). */
export interface ShippingRate extends FirestoreDoc {
  state: string;
  city: string;
  amount: number;
}
