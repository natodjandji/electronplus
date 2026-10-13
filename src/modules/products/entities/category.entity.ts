import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Category extends FirestoreDoc {
  code: string; // e.g. "iluminacion" — the catalog's ?category= value, never changed
  label: string; // e.g. "Iluminación"
  /** The category's own code in the principal store's Profit Plus. Its
   * identity across syncs: a name can change in Profit, the code doesn't. */
  erpCode?: string;
}
