import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Supplier extends FirestoreDoc {
  name: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** The Profit Plus brand this supplier stands for (its code there): the
   * ERP sync assigns that brand's products to this supplier. */
  erpBrandCode?: string;
}
