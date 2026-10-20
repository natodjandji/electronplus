import { FirestoreDoc } from '../../firebase/firestore.repository';

/** Mercasist's API (api.mercasist.com/docs), as far as this app uses it. */

/** Mercado Libre's listing types, as the bulk publisher takes them. Their
 * names and fees per country are in Mercasist → Publicación masiva →
 * Herramientas → Tipos de publicación. */
export const LISTING_TYPES = ['gold_special', 'gold_pro', 'gold', 'bronze', 'free'] as const;
export const DEFAULT_LISTING_TYPE = 'gold_special';

/** One page of a Mercasist listing. */
export interface MercasistPage<T> {
  data: T[];
  pagination?: { total?: number; has_more?: boolean };
}

/** GET /publicaciones — a listing on Mercado Libre (tipo ML), or one in
 * Mercasist's own shop (tipo ST), which this app leaves alone. */
export interface MercasistPublication {
  id: number;
  id_ml: string | null;
  tipo: 'ML' | 'ST';
  titulo: string;
  /** Mercasist joins its own SKU with Mercado Libre's SELLER_SKU here. */
  sku: string | null;
  precio: number | null;
  moneda?: { nombre?: string; simbolo?: string } | null;
  disponibilidad: number | null;
  status: string;
  link_ml?: string | null;
  variaciones?: { id: number; sku?: string | null; cantidad?: number }[];
}

/** GET /ordenes — a sale; this app reads the Mercado Libre ones (tipo ML). */
export interface MercasistOrder {
  id: number;
  id_ml: string | null;
  estatus: string;
  tipo: string;
  moneda: string;
  /** "YYYY-MM-DD HH:MM:SS", Venezuela's time. */
  fecha: string;
  total: number | null;
  comprador?: { nick?: string | null; nombre?: string | null };
  articulos?: {
    id_ml?: string | null;
    titulo: string;
    sku?: string | null;
    cantidad: number;
    precio: number;
  }[];
}

/** settings/mercasist — what an admin chooses in the panel, plus what the
 * sync keeps between runs. Server-only (firestore.rules has no rule for
 * settings, so clients are denied). */
export interface MercasistSettings extends FirestoreDoc {
  /** Off until an admin checked the preview and turned it on. */
  enabled?: boolean;
  /** Each half can be turned off on its own (both on by default). */
  syncPrice?: boolean;
  syncStock?: boolean;
  /** Name and description changes on the web go to the publication too (on by default). */
  syncContent?: boolean;
  /** Admins get an email when products are ready to publish (on by default). */
  notifyNewProducts?: boolean;
  /** Products already announced as ready to publish (ids), and when the
   * last such email went out (ISO). */
  announcedProducts?: string[];
  newProductsNoticeAt?: string;
  /** Units kept back from Mercado Libre, so the last ones aren't sold twice. */
  safetyStock?: number;
  /** Mercado Libre's listing type for the bulk-publisher Excel. */
  listingType?: string;
  /** Publications this app paused (left the web, or no price), so it brings
   * back only those and never one an admin paused on purpose. */
  pausedBySync?: number[];
  /** Sales before this were already there when the integration started:
   * they aren't emailed. ISO string. */
  ordersBaselineAt?: string;
  lastSync?: MercasistSyncSummary & { at: string };
}

export interface MercasistSyncSummary {
  /** Mercado Libre publications in Mercasist. */
  publications: number;
  /** Of those, the ones with a product on the web (same SKU). */
  matched: number;
  updated: number;
  paused: number;
  activated: number;
  failed: number;
  /** Changes left for the next run (per-run cap, or a rate limit). */
  deferred: number;
  newSales: number;
  /** Products ready to publish that aren't on Mercado Libre yet. */
  readyToPublish?: number;
  /** The first few refusals, for the panel. */
  errors?: { sku: string; message: string }[];
}

/** The publications as the last run saw them, for the panel — kept in
 * snapshots/mercasist so opening the panel spends none of Mercasist's
 * daily request quota. */
export interface MercasistPublicationRow {
  id: number;
  idMl: string | null;
  sku: string;
  title: string;
  link?: string;
  status: string;
  price: number | null;
  stock: number | null;
  productId?: string;
  /** Why this app leaves it alone, when it does. */
  note?: string;
}

/** A Mercado Libre sale seen through Mercasist; the admins are emailed once. */
export interface MercasistSale extends FirestoreDoc {
  idMl: string | null;
  status: string;
  date: string;
  total: number;
  currency: string;
  buyer?: string;
  items: { title: string; sku?: string; qty: number; unitPrice: number }[];
}
