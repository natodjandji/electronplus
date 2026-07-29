import { FirestoreDoc } from '../../../firebase/firestore.repository';

/**
 * A product as registered in the secondary store's own system. Names/codes
 * differ from the Electron Plus catalog, so it's linked to a Product via
 * `linkedProductId` rather than sharing an id — Electron Plus stays the
 * source of truth, this record just reports the other store's stock for it.
 */
export interface SecondStoreProduct extends FirestoreDoc {
  name: string;
  code?: string;
  stock: number;
  price?: number;
  notes?: string;
  linkedProductId?: string;
}
