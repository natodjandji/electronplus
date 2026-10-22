import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { Role } from '../../../common/enums/role.enum';

/** Firestore doc at users/{uid} — id === the Firebase Auth uid. */
export interface User extends FirestoreDoc {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  /** Agreed at checkout to get order and quote updates on WhatsApp at
   * `phone` (see CustomerUpdatesService). */
  whatsappUpdates?: boolean;
  taxId?: string; // RIF / cédula

  // Shipping address saved from the first completed checkout, reused to
  // prefill later ones.
  address?: string;
  city?: string;
  state?: string;

  role: Role;

  creditLimit?: number;
  creditTermDays?: number;
  active: boolean;
}
