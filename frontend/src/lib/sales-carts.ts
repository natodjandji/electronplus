import type { Product } from "./product";
import { TAX_RATE } from "./electron-store";

/** No "cancelled": cancelling a cart deletes it. */
export type SalesCartStatus = "open" | "completed";
export type PriceList = "retail" | "wholesale";

export interface SalesCartItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  retailPrice: number;
  wholesalePrice: number;
}

export interface SalesCartCustomer {
  name?: string;
  taxId?: string;
  phone?: string;
}

export interface SalesCart {
  id: string;
  sellerId: string;
  sellerName: string;
  status: SalesCartStatus;
  customer: SalesCartCustomer;
  priceList: PriceList;
  discountPct: number;
  items: SalesCartItem[];
  quoteToken?: string;
  quoteNumber?: number;
  invoiceRef?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedQuoteLink {
  token: string;
  number: number;
  url: string;
  validUntil: string;
}

export interface SharedQuote {
  id: string;
  number: number;
  sellerName: string;
  customer: SalesCartCustomer;
  priceList: PriceList;
  lines: { sku: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  bcvRate?: number;
  issuedAt: string;
  validUntil: string;
  qrImageDataUrl: string;
}

export const salesCartKey = (id: string) => ["sales-carts", "cart", id] as const;
export const salesCartListKey = (status: "open" | "completed") =>
  ["sales-carts", "list", status] as const;

export const PRICE_LIST_LABEL: Record<PriceList, string> = {
  retail: "Precio detal",
  wholesale: "Precio al mayor",
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function unitPriceFor(item: SalesCartItem, priceList: PriceList) {
  return priceList === "wholesale" ? item.wholesalePrice : item.retailPrice;
}

/** Same arithmetic as the backend (sales-cart-totals.ts) and an order:
 * discount on the subtotal, then IVA on what's left. */
export function computeCartTotals(cart: Pick<SalesCart, "items" | "priceList" | "discountPct">) {
  const subtotal = round2(
    cart.items.reduce(
      (sum, item) => sum + round2(unitPriceFor(item, cart.priceList) * item.qty),
      0,
    ),
  );
  const discountAmount = round2((subtotal * cart.discountPct) / 100);
  const taxableBase = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableBase * TAX_RATE);
  return {
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    total: round2(taxableBase + taxAmount),
  };
}

/**
 * What a label carries: the QR holds the product's page
 * (…/product/qr/{id}, or …/product/{id}), the barcode its SKU. Anything
 * that isn't a link is taken as a SKU, which also covers typing one.
 */
export function parseScannedCode(raw: string): { productId: string } | { sku: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const match = new URL(value).pathname.match(/\/product\/(?:qr\/)?([^/]+)\/?$/);
      return match ? { productId: decodeURIComponent(match[1]) } : null;
    } catch {
      return null;
    }
  }
  return { sku: value };
}

export function findScannedProduct(
  raw: string,
  catalog: { byId: Map<string, Product>; bySku: Map<string, Product> },
): Product | undefined {
  const code = parseScannedCode(raw);
  if (!code) return undefined;
  return "productId" in code
    ? catalog.byId.get(code.productId)
    : catalog.bySku.get(code.sku.toUpperCase());
}

export function formatQuoteNumber(n: number) {
  return String(n).padStart(6, "0");
}

/** A WhatsApp link with the message ready; straight to the customer's chat
 * when their phone is known (Venezuelan numbers: 0414… → 58414…). */
export function whatsappShareHref(text: string, phone?: string) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  else if (digits.length === 10) digits = `58${digits}`;
  const base = digits.length >= 11 ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

/**
 * Holds a line's quantity while the seller is still tapping the stepper and
 * sends only where it settles: ten quick taps are one write, not ten.
 * `flush` sends whatever is waiting at once — before any other change, so
 * the server applies them in the order the seller made them.
 */
export function createQtyDebouncer(
  send: (productId: string, qty: number) => void,
  delayMs: number,
) {
  const pending = new Map<string, { qty: number; timer: ReturnType<typeof setTimeout> }>();
  const sendNow = (productId: string) => {
    const queued = pending.get(productId);
    if (!queued) return;
    clearTimeout(queued.timer);
    pending.delete(productId);
    send(productId, queued.qty);
  };
  return {
    set(productId: string, qty: number) {
      clearTimeout(pending.get(productId)?.timer);
      pending.set(productId, { qty, timer: setTimeout(() => sendNow(productId), delayMs) });
    },
    flush() {
      for (const productId of [...pending.keys()]) sendNow(productId);
    },
    get waiting() {
      return pending.size > 0;
    },
  };
}
