import { Module } from '@nestjs/common';
import { LinkedStockService } from './linked-stock.service';
import { SecondStoreIndex } from './second-store-index';

/** The second-store snapshot and the linked stock read from it, apart from
 * SecondStoreModule — which needs ProductsModule — so products and orders
 * can use them too. One index for everyone: the sync's writes keep it current. */
@Module({
  providers: [SecondStoreIndex, LinkedStockService],
  exports: [SecondStoreIndex, LinkedStockService],
})
export class LinkedStockModule {}
