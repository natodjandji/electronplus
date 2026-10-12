import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** No "cancelled": cancelling a cart deletes it (SalesCartsService.cancel). */
export enum SalesCartStatus {
  OPEN = 'open',
  COMPLETED = 'completed',
}

export enum PriceList {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale',
}

export interface SalesCartItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  /** Prices when the product first went into the cart — a catalog change
   * mid-sale doesn't move what the seller already told the customer. */
  retailPrice: number;
  wholesalePrice: number;
}

export interface SalesCartCustomer {
  name?: string;
  taxId?: string;
  phone?: string;
}

/** A customer's cart, built by a seller at the counter before the sale is
 * invoiced in Profit Plus. Never touches stock: the invoice in Profit does,
 * and the ERP sync brings that back. */
export interface SalesCart extends FirestoreDoc {
  sellerId: string;
  sellerName: string;
  status: SalesCartStatus;
  customer: SalesCartCustomer;
  priceList: PriceList;
  discountPct: number;
  items: SalesCartItem[];
  /** Token of the cart's public quote link, once shared (sharedQuotes/{token}). */
  quoteToken?: string;
  quoteNumber?: number;
  /** The Profit Plus invoice number, if the seller noted it when finishing. */
  invoiceRef?: string;
  closedAt?: Date;
  /** Caracas calendar day the sale was finished (YYYY-MM-DD),
   * so "today's sales" is an equality query that needs no composite index. */
  closedDay?: string;
}
