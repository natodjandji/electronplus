import type { LinkedStockService } from '../modules/second-store/linked-stock.service';

/** For tests that don't involve the second store: no product has linked units. */
export const noLinkedStock = {
  unitsByProduct: async () => ({}),
} as unknown as LinkedStockService;
