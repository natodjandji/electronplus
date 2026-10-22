import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../../common/enums/role.enum';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { PricingService } from '../products/pricing.service';
import { ProductsService } from '../products/products.service';
import { QuoteStatus } from './entities/quote.entity';
import { QuotesService } from './quotes.service';
import { noLinkedStock } from '../../test/no-linked-stock';

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
      new ProductsService(firestore as never, events, noLinkedStock),
      new PricingService(),
      events,
      {} as never,
    );

    await service.addLine('q1', client, { productId: 'p1', qty: 2 });
    const quote = await service.addLine('q1', client, { productId: 'p1', qty: 3 });

    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toMatchObject({ productId: 'p1', qty: 5, unitPrice: 10 });
  });
});

describe('QuotesService.setPaymentMethod', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };

  function build() {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.QUOTES, 'q1', {
      userId: client.id,
      status: QuoteStatus.DRAFT,
      globalDiscountPct: 0,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Three methods an admin added: same "other" type, different names.
    const methods: Record<string, object> = {
      'pago-movil': {
        id: 'pago-movil',
        backendMethod: 'other',
        label: 'Pago Móvil',
        enabled: true,
      },
      efectivo: { id: 'efectivo', backendMethod: 'other', label: 'Efectivo', enabled: true },
      binance: { id: 'binance', backendMethod: 'other', label: 'Binance', enabled: false },
    };
    const paymentMethods = { findById: async (id: string) => methods[id] ?? null };
    const events = new EventEmitter2();
    const service = new QuotesService(
      firestore as never,
      new ProductsService(firestore as never, events, noLinkedStock),
      new PricingService(),
      events,
      paymentMethods as never,
    );
    return { firestore, service };
  }

  it('keeps which method was chosen, not just its type', async () => {
    const { service } = build();
    const quote = await service.setPaymentMethod('q1', client, { paymentMethodId: 'efectivo' });
    expect(quote).toMatchObject({
      expectedPaymentMethod: 'other',
      expectedPaymentMethodId: 'efectivo',
      expectedPaymentMethodLabel: 'Efectivo',
    });
  });

  it('refuses a method that is switched off or unknown', async () => {
    const { service } = build();
    await expect(
      service.setPaymentMethod('q1', client, { paymentMethodId: 'binance' }),
    ).rejects.toThrow('no está disponible');
    await expect(
      service.setPaymentMethod('q1', client, { paymentMethodId: 'nope' }),
    ).rejects.toThrow('no está disponible');
  });

  it('still takes only a type (older clients), forgetting a previous choice', async () => {
    const { service } = build();
    await service.setPaymentMethod('q1', client, { paymentMethodId: 'pago-movil' });
    const quote = await service.setPaymentMethod('q1', client, {
      expectedPaymentMethod: 'zelle' as never,
    });
    expect(quote).toMatchObject({
      expectedPaymentMethod: 'zelle',
      expectedPaymentMethodId: null,
      expectedPaymentMethodLabel: null,
    });
  });
});

describe('QuotesService.create', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };

  function setup() {
    const firestore = new FakeFirestore();
    const events = new EventEmitter2();
    const service = new QuotesService(
      firestore as never,
      new ProductsService(firestore as never, events, noLinkedStock),
      new PricingService(),
      events,
      {} as never,
    );
    const quotes = async () =>
      (await firestore.collection(Collections.QUOTES).get()).docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      }));
    return { firestore, service, quotes };
  }

  const draft = (userId: string, items: unknown[] = []) => ({
    userId,
    customerName: 'Antes',
    customerTaxId: 'V-111',
    status: QuoteStatus.DRAFT,
    globalDiscountPct: 0,
    items,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  });

  it('reuses the customer’s empty draft instead of leaving another one', async () => {
    const { service, quotes } = setup();
    const first = await service.create(client, { customerName: 'Andrés Márquez' });
    const second = await service.create(client, { customerName: 'Ferretería Andrés' });

    expect(second.id).toBe(first.id);
    expect(await quotes()).toEqual([
      expect.objectContaining({ id: first.id, customerName: 'Ferretería Andrés', items: [] }),
    ]);
  });

  it('writes the reused draft afresh: the new request’s data, dated now', async () => {
    const { firestore, service } = setup();
    firestore.seed(Collections.QUOTES, 'q-old', draft(client.id));

    const quote = await service.create(client, { customerName: 'Andrés Márquez' });

    expect(quote.id).toBe('q-old');
    expect(quote.customerName).toBe('Andrés Márquez');
    // The old request's tax id doesn't carry over.
    expect(quote.customerTaxId).toBeUndefined();
    expect(quote.createdAt).not.toEqual(new Date('2026-09-01T12:00:00Z'));
  });

  it('starts a new quote when the draft has products, or the empty one is someone else’s', async () => {
    const { firestore, service, quotes } = setup();
    firestore.seed(Collections.QUOTES, 'q-with-items', draft(client.id, [{ productId: 'p1' }]));
    firestore.seed(Collections.QUOTES, 'q-other-user', draft('client-2'));

    const quote = await service.create(client, { customerName: 'Andrés Márquez' });

    expect(['q-with-items', 'q-other-user']).not.toContain(quote.id);
    expect(await quotes()).toHaveLength(3);
  });
});
