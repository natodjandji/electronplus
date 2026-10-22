import { Injectable } from '@nestjs/common';
import { SecondStoreProduct } from './entities/second-store-product.entity';
import { SECOND_STORE_STOCK_LOAD, SecondStoreIndex } from './second-store-index';

/**
 * The second store's units each catalog product can also be sold from. A
 * second-store record linked to a product (see the entity) counts toward
 * that product's stock on the storefront, in checkout and in the sales
 * assistant, as one figure — customers aren't told it sits in two places.
 * An order takes what the main store lacks from here, and the store moves
 * those units over with a dispatch note in Profit Plus.
 *
 * Read-only: Profit Plus keeps both stores' stock and the syncs bring it in;
 * the web only adds the two up.
 */
@Injectable()
export class LinkedStockService {
  private view: { source: SecondStoreProduct[]; units: Record<string, number> } | null = null;

  constructor(private readonly index: SecondStoreIndex) {}

  /** Units per linked catalog product, at most a minute old. Several
   * records linked to one product add up, and a record Profit Plus no
   * longer sends doesn't count. */
  async unitsByProduct(): Promise<Record<string, number>> {
    const items = await this.index.load(SECOND_STORE_STOCK_LOAD);
    if (this.view?.source !== items) {
      const units: Record<string, number> = {};
      for (const item of items) {
        if (!item.linkedProductId || item.missingFromErpSince) continue;
        units[item.linkedProductId] =
          (units[item.linkedProductId] ?? 0) + Math.max(0, item.stock ?? 0);
      }
      this.view = { source: items, units };
    }
    return this.view.units;
  }
}
