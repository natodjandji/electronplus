import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { Role } from '../../../common/enums/role.enum';

/** Firestore doc at users/{uid} — id === the Firebase Auth uid. */
export interface User extends FirestoreDoc {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  taxId?: string; // RIF / cédula

  role: Role;

  creditLimit?: number;
  creditTermDays?: number;
  active: boolean;
}
