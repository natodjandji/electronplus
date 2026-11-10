import { Role } from '../../../common/enums/role.enum';
import { PricingService } from '../pricing.service';
import { Product } from '../entities/product.entity';
import { toCatalogDto } from './product.mapper';

/** The cost comes from Profit Plus on every synced product: what the store
 * paid, which no customer, seller or warehouse operator should see. */
describe('toCatalogDto', () => {
  const product = {
    id: 'aplique-dot',
    sku: '7591234567890',
    name: 'Aplique DOT',
    category: { id: 'c1', code: 'iluminacion', label: 'Iluminación' },
    categoryId: 'c1',
    retailPrice: 10.5,
    wholesalePrice: 8.25,
    cost: 6.4,
    stock: 12,
    active: true,
  } as Product;
  const pricing = { priceFor: (p: Product) => p.retailPrice } as unknown as PricingService;

  it.each([undefined, Role.CLIENT, Role.SELLER, Role.WAREHOUSE_OPERATOR])(
    'leaves the cost out for %s',
    (role) => {
      const dto = toCatalogDto(product, role, pricing);
      expect(dto).not.toHaveProperty('cost');
      expect(JSON.stringify(dto)).not.toContain('6.4');
    },
  );

  it('gives it to an admin', () => {
    expect(toCatalogDto(product, Role.ADMIN, pricing)).toMatchObject({ cost: 6.4 });
  });
});
