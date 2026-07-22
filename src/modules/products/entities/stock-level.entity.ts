import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** Firestore doc at products/{productId}/stockLevels/{warehouseId}. */
export interface StockLevel extends FirestoreDoc {
  productId: string;
  warehouseId: string;
  warehouse: { id: string; code: string; name: string };
  quantity: number;
  location?: string; // e.g. "Estante 3B"
}
