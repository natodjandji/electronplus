import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Category extends FirestoreDoc {
  code: string; // e.g. "iluminacion"
  label: string; // e.g. "Iluminación"
}
