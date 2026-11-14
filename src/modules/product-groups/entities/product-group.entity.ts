import { FirestoreDoc } from '../../../firebase/firestore.repository';

/**
 * Products that look the same on the shelf but are separate items in the
 * system (the same panel in 3000K and 6500K, say). One printed label with a
 * QR stands for all of them: it opens a page listing each one, and a seller
 * scanning it picks the right one from the list.
 */
export interface ProductGroup extends FirestoreDoc {
  name: string;
  /** In the order the page lists them. */
  productIds: string[];
}
