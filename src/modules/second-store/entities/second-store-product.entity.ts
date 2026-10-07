import { FirestoreDoc } from '../../../firebase/firestore.repository';

/**
 * A product as registered in the secondary store's own system. Names/codes
 * differ from the Electron Plus catalog, so it's linked to a Product via
 * `linkedProductId` rather than sharing an id — Electron Plus stays the
 * source of truth, this record just reports the other store's stock for it.
 */
export interface SecondStoreProduct extends FirestoreDoc {
  name: string;
  /** External code from the secundaria store's own Profit Plus (`art.ref`)
   * — once present, sync matches on this instead of the `name` text match
   * it falls back to for records that predate the code being available. */
  code?: string;
  stock: number;
  /** ERP-synced retail/wholesale prices (profit-plus-bridge-secundaria's
   * precio1/precio2) — separate from the pre-existing manual `price` field
   * below so a manually-entered reference price is never silently
   * overwritten by (or confused with) what the sync reports. */
  retailPrice?: number;
  wholesalePrice?: number;
  /** Manual reference price, set from the admin form — not touched by sync. */
  price?: number;
  notes?: string;
  linkedProductId?: string;
  /** 'manual' for a record an admin created; the sync never retires those.
   * Absent on records that predate this field. */
  source?: 'erp' | 'manual';
  /** Set when Profit Plus stopped sending this linked record (deleted
   * there); cleared if it comes back. Unlinked records are deleted instead. */
  missingFromErpSince?: Date | null;
}
