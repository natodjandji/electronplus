import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { PaymentMethod } from '../../payments/entities/payment.entity';

/** Admin-editable presentation config for a checkout payment option. Doc id is the checkout key (e.g. "transferencia"). */
export interface PaymentMethodConfig extends FirestoreDoc {
  backendMethod: PaymentMethod;
  label: string;
  details: string[];
  needsReference: boolean;
  needsProof: boolean;
  enabled: boolean;
}
