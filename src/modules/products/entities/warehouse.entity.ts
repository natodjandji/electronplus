import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Warehouse extends FirestoreDoc {
  code: string; // e.g. "DEP-A"
  name: string; // e.g. "Depósito A"
}
