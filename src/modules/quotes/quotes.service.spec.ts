import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../../common/enums/role.enum';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { PricingService } from '../products/pricing.service';
import { ProductsService } from '../products/products.service';
import { QuoteStatus } from './entities/quote.entity';
import { QuotesService } from './quotes.service';

describe('QuotesService.addLine', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };

  it('adds units to the line a product already has, instead of a second line', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.PRODUCTS, 'p1', {
      sku: 'SKU-1',
      name: 'Breaker 20A',
      category: { id: 'c1', code: 'c1', label: 'Cat' },
      retailPrice: 10,
      wholesalePrice: 8,
      stock: 50,
      active: true,
    });
    firestore.seed(Collections.QUOTES, 'q1', {
      userId: client.id,
      status: QuoteStatus.DRAFT,
      globalDiscountPct: 0,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const events = new EventEmitter2();
    const service = new QuotesService(
      firestore as never,
      new ProductsService(firestore as never, events),
      new PricingService(),
      events,
    );

    await service.addLine('q1', client, { productId: 'p1', qty: 2 });
    const quote = await service.addLine('q1', client, { productId: 'p1', qty: 3 });

    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toMatchObject({ productId: 'p1', qty: 5, unitPrice: 10 });
  });
});
