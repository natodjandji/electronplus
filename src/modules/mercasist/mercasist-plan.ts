import { round2, TAX_RATE } from '../../common/utils/money';
import { Product } from '../products/entities/product.entity';
import { MercasistOrder, MercasistPublication, MercasistPublicationRow } from './mercasist.types';

/** Mercado Libre Venezuela lists in dollars (or bolívares); the store's
 * prices are in dollars. */
export const MERCASIST_CURRENCY = 'USD';
/** Mercado Libre caps listing titles at 60 characters. */
export const TITLE_MAX = 60;
/** How long an open Mercado Libre sale holds its units back from what the
 * publication shows. Stock only drops when the sale is invoiced in Profit,
 * and until then the sync would put the sold units back on sale; by the
 * end of this window the sale is invoiced, so counting it longer would
 * hide units Profit already took off. */
export const COMMITTED_WINDOW_DAYS = 3;

/** Mercasist's names for a publication's state. */
export const ACTIVE = 'Activo';
export const PAUSED = 'Pausado';

export function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? '').trim().toUpperCase();
}

/** The retail price with IVA: what a buyer pays, as Mercado Libre shows it. */
export function mercasistPrice(product: Pick<Product, 'retailPrice'>): number {
  return round2(product.retailPrice * (1 + TAX_RATE));
}

/** Why a product can't be on sale on Mercado Libre right now, or undefined. */
export function offSaleReason(product: Product): string | undefined {
  if (!product.active || product.erpRemovedAt) return 'Oculto en la web';
  if (!(product.retailPrice > 0)) return 'Sin precio en la web';
  return undefined;
}

export function listedQuantity(product: Pick<Product, 'stock'>, held: number, safety: number) {
  return Math.max(0, Math.floor(product.stock ?? 0) - held - Math.max(0, safety));
}

function isUsd(currency: MercasistPublication['moneda']): boolean {
  const text = `${currency?.nombre ?? ''} ${currency?.simbolo ?? ''}`;
  return /d[oó]lar|\busd\b|us\$|u\$s/i.test(text);
}

/** "YYYY-MM-DD HH:MM:SS" in Venezuela's time (UTC-4, no daylight saving). */
export function orderTime(fecha: string): number {
  return Date.parse(`${fecha.replace(' ', 'T')}-04:00`);
}

/** Units of each SKU in open Mercado Libre sales from the last few days —
 * sold, but not invoiced in Profit yet. */
export function heldUnits(orders: MercasistOrder[], now: Date): Map<string, number> {
  const since = now.getTime() - COMMITTED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const held = new Map<string, number>();
  for (const order of orders) {
    if (order.tipo !== 'ML' || !(orderTime(order.fecha) >= since)) continue;
    for (const line of order.articulos ?? []) {
      const sku = normalizeSku(line.sku);
      if (sku) held.set(sku, (held.get(sku) ?? 0) + Math.max(0, line.cantidad));
    }
  }
  return held;
}

/** The web's products by SKU; when two share one, the one on sale wins. */
export function productsBySku(products: Product[]): Map<string, Product> {
  const bySku = new Map<string, Product>();
  for (const product of products) {
    const sku = normalizeSku(product.sku);
    if (!sku) continue;
    const current = bySku.get(sku);
    if (!current || (offSaleReason(current) && !offSaleReason(product))) bySku.set(sku, product);
  }
  return bySku;
}

export interface PlanOp {
  publicationId: number;
  sku: string;
  title: string;
  productId?: string;
  body: { precio?: number; moneda?: string; disponibilidad?: number; status?: string };
  /** What the change does, for the summary and the preview. */
  kind: 'update' | 'pause' | 'activate';
}

export interface Plan {
  ops: PlanOp[];
  /** Every Mercado Libre publication, as the panel lists it. */
  rows: MercasistPublicationRow[];
  /** Publications this app has paused or emptied, after this run's plan. */
  pausedBySync: Set<number>;
}

/**
 * What a run sends Mercasist, per Mercado Libre publication with a product
 * of the same SKU on the web: the price with IVA in dollars, the stock
 * (Profit's, less open sales and the safety stock), a pause when the
 * product left the web or lost its price, and its return once it's back
 * (also after Mercado Libre paused it for selling out).
 * Only what differs from what Mercasist shows goes out. Stock changes go
 * first, since they are the ones that prevent selling what isn't there.
 * Publications with variations, or without a matching product, are left
 * alone.
 */
export function planSync(input: {
  publications: MercasistPublication[];
  products: Product[];
  held: Map<string, number>;
  syncPrice: boolean;
  syncStock: boolean;
  safetyStock: number;
  pausedBySync: Iterable<number>;
}): Plan {
  const bySku = productsBySku(input.products);
  const paused = new Set(input.pausedBySync);
  const stockOps: PlanOp[] = [];
  const priceOps: PlanOp[] = [];
  const rows: MercasistPublicationRow[] = [];
  const seen = new Set<number>();

  for (const pub of input.publications) {
    if (pub.tipo !== 'ML') continue;
    seen.add(pub.id);
    const sku = normalizeSku(pub.sku);
    const product = sku ? bySku.get(sku) : undefined;
    const row: MercasistPublicationRow = {
      id: pub.id,
      idMl: pub.id_ml,
      sku: pub.sku?.trim() ?? '',
      title: pub.titulo,
      ...(pub.link_ml && { link: pub.link_ml }),
      status: pub.status,
      price: pub.precio,
      stock: pub.disponibilidad,
      ...(product && { productId: product.id }),
    };
    rows.push(row);

    if (!product) {
      row.note = sku ? 'Ningún producto de la web tiene este SKU' : 'La publicación no tiene SKU';
      continue;
    }
    if ((pub.variaciones ?? []).length > 0) {
      row.note = 'Tiene variaciones: se maneja en Mercasist';
      continue;
    }
    const base = { publicationId: pub.id, sku: row.sku, title: pub.titulo, productId: product.id };

    const reason = offSaleReason(product);
    if (reason) {
      row.note = reason;
      if (pub.status === ACTIVE) {
        stockOps.push({ ...base, kind: 'pause', body: { status: PAUSED } });
        paused.add(pub.id);
      }
      continue;
    }

    const qty = listedQuantity(product, input.held.get(sku) ?? 0, input.safetyStock);
    const body: PlanOp['body'] = {};
    const price = mercasistPrice(product);
    if (
      input.syncPrice &&
      (pub.precio === null || Math.abs(pub.precio - price) >= 0.005 || !isUsd(pub.moneda))
    ) {
      body.precio = price;
      body.moneda = MERCASIST_CURRENCY;
    }
    if (input.syncStock && qty !== pub.disponibilidad) body.disponibilidad = qty;
    // Paused by this app, or by Mercado Libre when a sale took the last
    // unit (it shows 0 then); one an admin paused keeps its stock and stays.
    const emptied = paused.has(pub.id) || (pub.disponibilidad ?? 0) === 0;
    const activate = pub.status === PAUSED && emptied && qty > 0;
    if (activate) {
      body.status = ACTIVE;
      paused.delete(pub.id);
    } else if (pub.status === ACTIVE && qty > 0) {
      // Back on sale without this app's help (or never paused by it).
      paused.delete(pub.id);
    }
    // Emptied by this run: Mercado Libre pauses it, and this app brings it back.
    if (body.disponibilidad === 0) paused.add(pub.id);

    if (Object.keys(body).length === 0) continue;
    const op: PlanOp = { ...base, kind: activate ? 'activate' : 'update', body };
    (body.disponibilidad !== undefined || activate ? stockOps : priceOps).push(op);
  }

  // A publication gone from Mercasist (finished or deleted) is forgotten.
  for (const id of paused) if (!seen.has(id)) paused.delete(id);
  return { ops: [...stockOps, ...priceOps], rows, pausedBySync: paused };
}

/** Why a product isn't ready for the bulk-publisher Excel, or undefined. */
export function exportBlocker(product: Product, safetyStock: number): string | undefined {
  const off = offSaleReason(product);
  if (off) return off;
  if (!normalizeSku(product.sku)) return 'Sin SKU';
  if (!product.imageUrl) return 'Sin foto';
  if (listedQuantity(product, 0, safetyStock) === 0) return 'Sin stock';
  return undefined;
}

/** A title Mercado Libre takes: 60 characters at most, cut at a word. */
export function listingTitle(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= TITLE_MAX) return clean;
  const cut = clean.slice(0, TITLE_MAX + 1);
  const space = cut.lastIndexOf(' ');
  // Without a dangling comma or dash where the cut fell.
  return (space > 30 ? cut.slice(0, space) : clean.slice(0, TITLE_MAX)).replace(
    /[\s,;:.\-–—]+$/,
    '',
  );
}

/** The columns of Mercasist's bulk publisher (Publicaciones → Publicación
 * masiva → Carga MercadoLibre), named as Mercasist names its fields, so
 * matching them in its column step is one click each. */
export const EXPORT_COLUMNS = [
  'Título',
  'Descripción',
  'Precio',
  'Cantidad',
  'Condición',
  'Imágenes',
  'Tipo de publicación',
  'Moneda',
  'SKU',
  'Atributos',
] as const;

/** One product's row for that Excel (a product exportBlocker lets through). */
export function exportRow(
  product: Product,
  listingType: string,
  safetyStock: number,
): (string | number)[] {
  const attributes = [
    ...(product.brand?.trim() ? [`BRAND: ${product.brand.trim()}`] : []),
    `MODEL: ${product.sku.trim()}`,
  ].join('; ');
  return [
    listingTitle(product.name),
    product.specs?.trim() || product.name.trim(),
    mercasistPrice(product),
    listedQuantity(product, 0, safetyStock),
    'nuevo',
    product.imageUrl ?? '',
    listingType,
    MERCASIST_CURRENCY,
    product.sku.trim(),
    attributes,
  ];
}
