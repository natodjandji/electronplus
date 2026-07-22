import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Supplier extends FirestoreDoc {
  name: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
}
