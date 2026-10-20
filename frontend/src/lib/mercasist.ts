/** Mirrors src/modules/mercasist on the API. */
import { API_BASE_URL, ApiError } from "./api-client";
import { auth } from "./firebase";

export interface MercasistSyncSummary {
  publications: number;
  matched: number;
  updated: number;
  paused: number;
  activated: number;
  failed: number;
  deferred: number;
  newSales: number;
  errors?: { sku: string; message: string }[];
}

export interface MercasistStatus {
  /** The API token is set on the server. */
  configured: boolean;
  enabled: boolean;
  syncPrice: boolean;
  syncStock: boolean;
  safetyStock: number;
  listingType: string;
  lastSync?: MercasistSyncSummary & { at: string };
  /** Sales from before this weren't emailed. */
  salesSince?: string;
  /** When the publications list was last read from Mercasist. */
  snapshotAt?: string;
  quota?: { remainingDay?: number; limitDay?: number; at: string };
}

export interface MercasistChange {
  publicationId: number;
  sku: string;
  title: string;
  kind: "update" | "pause" | "activate";
  body: { precio?: number; moneda?: string; disponibilidad?: number; status?: string };
  /** What Mercasist shows now; `currency` is its symbol ("U$S", "Bs"). */
  current: { price: number | null; currency?: string; stock: number | null; status: string };
}

export interface MercasistRunResult {
  summary: MercasistSyncSummary;
  changes?: MercasistChange[];
  skipped?: string;
}

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
  note?: string;
  product?: { id: string; name: string; price: number };
}

export interface MercasistExportSummary {
  ready: number;
  published: number;
  blocked: { reason: string; count: number }[];
  snapshotAt?: string;
}

export interface MercasistSale {
  id: string;
  idMl: string | null;
  status: string;
  date: string;
  total: number;
  currency: string;
  buyer?: string;
  items: { title: string; sku?: string; qty: number; unitPrice: number }[];
}

export const mercasistKey = ["admin", "mercasist"] as const;

/** Mercado Libre's listing types the bulk publisher takes (see the API's
 * LISTING_TYPES); their names and fees are in Mercasist's tools. */
export const LISTING_TYPES = ["gold_special", "gold_pro", "gold", "bronze", "free"] as const;

/** Mercasist's bulk publisher on the trial period takes 20 per file. */
export const TRIAL_BATCH = 20;

export const mercadoLibreSaleUrl = (idMl: string) =>
  `https://www.mercadolibre.com.ve/ventas/${encodeURIComponent(idMl)}/detalle`;

/** Downloads the bulk-publisher Excel (it needs the admin's token, so a
 * plain link won't do). */
export async function downloadMercasistExcel(lote?: number, tamano?: number): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  const params = new URLSearchParams();
  if (tamano) {
    params.set("lote", String(lote ?? 1));
    params.set("tamano", String(tamano));
  }
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/mercasist/export${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.message ?? res.statusText, res.status);
  }
  const blob = await res.blob();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `electronplus-mercado-libre-${day}${tamano ? `-lote-${lote ?? 1}` : ""}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
