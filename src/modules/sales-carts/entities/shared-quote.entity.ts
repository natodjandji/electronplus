import { FirestoreDoc } from '../../../firebase/firestore.repository';
import { PriceList, SalesCartCustomer } from './sales-cart.entity';

export interface SharedQuoteLine {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/** A sales cart frozen when the seller shared it — what the customer's link
 * shows. Keyed by the link's token; editing the cart afterwards doesn't
 * change it until the seller shares again. */
export interface SharedQuote extends FirestoreDoc {
  cartId: string;
  number: number;
  sellerName: string;
  customer: SalesCartCustomer;
  priceList: PriceList;
  lines: SharedQuoteLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  /** BCV rate (Bs per USD) on the day it was shared, when it was available. */
  bcvRate?: number;
  issuedAt: Date;
  validUntil: Date;
  /** QR pointing back at the quote's own page, for the printed copy. */
  qrImageDataUrl: string;
}
