import { round2, TAX_RATE } from '../../common/utils/money';
import { Product } from '../products/entities/product.entity';

/**
 * The storefront's products as a Meta catalog data feed (CSV), for the
 * catalog WhatsApp and Instagram show. Commerce Manager fetches it on a
 * schedule, so prices and stock follow the web without anyone uploading
 * anything. The `id` is the web's product id: what WhatsApp product
 * messages name an item by (product_retailer_id).
 */
export const META_CATALOG_COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
  'product_type',
] as const;

/** Meta's limits for these fields. */
const TITLE_LIMIT = 200;
const DESCRIPTION_LIMIT = 9999;
/** Meta needs a brand (or a GTIN/MPN); products from Profit Plus without one
 * go out as the store's. */
const FALLBACK_BRAND = 'Electron Plus';

/** One row per active product with a photo — Meta rejects items without
 * one. Prices are the retail price with IVA, in dollars, as the store chose
 * for this catalog (the web itself shows REF before IVA). */
export function buildMetaCatalog(siteUrl: string, products: Product[]): string {
  const base = siteUrl.replace(/\/+$/, '');
  const rows = products
    .filter((p) => p.imageUrl)
    .map((p) => [
      p.id,
      clip(p.name, TITLE_LIMIT),
      clip(p.specs?.trim() || p.name, DESCRIPTION_LIMIT),
      p.stock > 0 ? 'in stock' : 'out of stock',
      'new',
      `${round2(p.retailPrice * (1 + TAX_RATE)).toFixed(2)} USD`,
      `${base}/product/${encodeURIComponent(p.id)}`,
      p.imageUrl!,
      p.brand?.trim() || FALLBACK_BRAND,
      p.category?.label ?? '',
    ]);
  return (
    [META_CATALOG_COLUMNS, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n'
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** RFC 4180: quoted when it holds a comma, quote or line break; quotes
 * doubled. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
