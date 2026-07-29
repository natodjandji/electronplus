import { FirestoreDoc } from '../../../firebase/firestore.repository';

export interface Product extends FirestoreDoc {
  sku: string;
  name: string;
  specs?: string;

  categoryId: string;
  /** Denormalized so catalog reads never need a join. */
  category: { id: string; code: string; label: string };

  /** Supplier this product is restocked from — drives supplier-filtered product pickers on POs/invoices. */
  supplierId?: string;

  retailPrice: number;
  wholesalePrice: number;
  cost?: number;

  /** Aggregate stock across all warehouses — the number orders reserve against. */
  stock: number;
  minStockThreshold?: number;

  imageUrl?: string;
  /** ~400px variant of imageUrl for list/cart/thumbnail views — only set for
   * images uploaded via POST /uploads/product-image; falls back to imageUrl
   * for products with a legacy (pre-Storage-migration) image. */
  thumbnailUrl?: string;
  active: boolean;

  /** Opaque, persisted token — looked up via `where('qrToken', '==', token)`. */
  qrToken: string;
  /** Free-text physical location, e.g. "Depósito A · Estante 3B". */
  warehouseLocation?: string;

  erpExternalId?: string;
  erpSyncedAt?: Date;
}
