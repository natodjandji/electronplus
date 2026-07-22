import { Injectable } from '@nestjs/common';
import { Product } from './entities/product.entity';

@Injectable()
export class PricingService {
  /**
   * Every client pays retail. Wholesale pricing is no longer an
   * account-level tier — the only route to a lower price is an
   * admin-granted discount on an approved quote (see quotes module).
   */
  priceFor(product: Pick<Product, 'retailPrice'>): number {
    return product.retailPrice;
  }
}
