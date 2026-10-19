import { BadRequestException } from '@nestjs/common';
import { round2, TAX_RATE } from '../../common/utils/money';
import { FulfillmentMethod } from '../orders/entities/order.entity';

/** Cashea's web-checkout payload, as its SDK validates it. */
export interface CasheaCheckoutPayload {
  deliveryMethod: 'IN_STORE' | 'DELIVERY';
  redirectUrl: string;
  merchantName: string;
  identificationNumber: string;
  externalClientId: string;
  invoiceId?: string;
  deliveryPrice?: number;
  orders: {
    store: { id: number; name: string; enabled: boolean };
    products: {
      id: string;
      name: string;
      sku: string;
      description: string;
      imageUrl: string;
      quantity: number;
      /** Unit price before tax and discount. */
      price: number;
      /** Per unit; Cashea charges (price + tax - discount) × quantity. */
      tax: number;
      discount: number;
    }[];
  }[];
}

/** What the payload is built from: the stored order, never the browser. */
export interface CasheaOrderInput {
  id: string;
  fulfillmentMethod?: FulfillmentMethod;
  shippingTaxId?: string;
  subtotal: number;
  discountAmount?: number;
  shippingCost?: number;
  items: { productId: string; sku: string; name: string; qty: number; unitPrice: number }[];
}

export interface CasheaPayloadOptions {
  redirectUrl: string;
  merchantName: string;
  externalClientId: string;
  storeId: number;
  storeName: string;
  /** Shown for a product with no photo (Cashea requires an image). */
  fallbackImageUrl: string;
}

const DESCRIPTION_MAX = 300;

/** The buyer's cédula as Cashea takes it (digits only). Cashea finances
 * people, so a company RIF (J/G) or a passport isn't accepted. */
export function casheaIdentificationNumber(taxId: string | undefined): string {
  const match = /^\s*([VE])\s*-?\s*([\d.]{5,12})\s*$/i.exec(taxId ?? '');
  const digits = match?.[2].replace(/\./g, '');
  if (!digits || digits.length < 5 || digits.length > 9) {
    throw new BadRequestException(
      'Para pagar con Cashea usa tu cédula (V o E) en los datos del pedido.',
    );
  }
  return digits;
}

/**
 * The order as Cashea's checkout: one line per product with its unit
 * price, the IVA per unit and the order's discount code spread over the
 * units in proportion to their price — so the total Cashea finances
 * matches the order's, give or take a few cents of per-unit rounding.
 */
export function buildCasheaPayload(
  order: CasheaOrderInput,
  products: Map<string, { imageUrl?: string; specs?: string }>,
  options: CasheaPayloadOptions,
): CasheaCheckoutPayload {
  const discountRate =
    order.subtotal > 0 ? Math.min(1, (order.discountAmount ?? 0) / order.subtotal) : 0;
  return {
    deliveryMethod: order.fulfillmentMethod === FulfillmentMethod.PICKUP ? 'IN_STORE' : 'DELIVERY',
    redirectUrl: options.redirectUrl,
    merchantName: options.merchantName,
    identificationNumber: casheaIdentificationNumber(order.shippingTaxId),
    externalClientId: options.externalClientId,
    invoiceId: order.id,
    deliveryPrice: round2(order.shippingCost ?? 0),
    orders: [
      {
        store: { id: options.storeId, name: options.storeName, enabled: true },
        products: order.items.map((item) => {
          const product = products.get(item.productId);
          const discount = round2(item.unitPrice * discountRate);
          return {
            id: item.productId,
            name: item.name,
            sku: item.sku || item.productId,
            description: (product?.specs?.trim() || item.name).slice(0, DESCRIPTION_MAX),
            imageUrl: httpsUrl(product?.imageUrl) ?? options.fallbackImageUrl,
            quantity: item.qty,
            price: item.unitPrice,
            tax: round2((item.unitPrice - discount) * TAX_RATE),
            discount,
          };
        }),
      },
    ],
  };
}

/** What Cashea will finance for this payload. */
export function casheaPayloadTotal(payload: CasheaCheckoutPayload): number {
  const lines = payload.orders
    .flatMap((o) => o.products)
    .reduce((sum, p) => sum + (p.price + p.tax - p.discount) * p.quantity, 0);
  return round2(lines + (payload.deliveryPrice ?? 0));
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
