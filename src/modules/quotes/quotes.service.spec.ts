import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../../common/enums/role.enum';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { PricingService } from '../products/pricing.service';
import { ProductsService } from '../products/products.service';
import { QuoteStatus } from './entities/quote.entity';
import { QUOTE_SENT_EVENT, QUOTE_STATUS_CHANGED_EVENT, QuotesService } from './quotes.service';
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

describe('QuotesService lifecycle', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };
  const otherClient = { id: 'client-2', email: 'o@example.com', role: Role.CLIENT };
  const admin = { id: 'admin-1', email: 'a@example.com', role: Role.ADMIN };

  const product = (overrides: Record<string, unknown> = {}) => ({
    sku: '7591996047191',
    model: 'LED208-N',
    name: 'Aplique LED 15W',
    category: { id: 'c1', code: 'c1', label: 'Cat' },
    retailPrice: 10,
    wholesalePrice: 8,
    stock: 50,
    active: true,
    ...overrides,
  });

  const line = (overrides: Record<string, unknown> = {}) => ({
    id: 'line-1',
    productId: 'p1',
    sku: '7591996047191',
    model: 'LED208-N',
    name: 'Aplique LED 15W',
    qty: 3,
    unitPrice: 10,
    wholesalePrice: 8,
    discountPct: 0,
    ...overrides,
  });

  function setup(status = QuoteStatus.DRAFT, items: unknown[] = [line()]) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.PRODUCTS, 'p1', product());
    firestore.seed(
      Collections.PRODUCTS,
      'no-price',
      product({ name: 'Sin precio', retailPrice: 0 }),
    );
    firestore.seed(Collections.QUOTES, 'q1', {
      userId: client.id,
      customerName: 'Ferretería Andrés',
      status,
      globalDiscountPct: 0,
      items,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const events = new EventEmitter2();
    const emitted: { event: string; payload: unknown }[] = [];
    events.onAny((event, payload) => emitted.push({ event: String(event), payload }));
    const service = new QuotesService(
      firestore as never,
      new ProductsService(firestore as never, events, noLinkedStock),
      new PricingService(),
      events,
      {} as never,
    );
    return { service, emitted };
  }

  it('sends a draft with products and tells the admins who asked and how much', async () => {
    const { service, emitted } = setup(QuoteStatus.DRAFT, [line(), line({ id: 'line-2', qty: 2 })]);

    const quote = await service.send('q1', client);

    expect(quote.status).toBe(QuoteStatus.SENT);
    expect(emitted).toEqual([
      {
        event: QUOTE_SENT_EVENT,
        payload: { quoteId: 'q1', customerName: 'Ferretería Andrés', units: 5 },
      },
    ]);
  });

  it('refuses to send an empty quote, and says nothing to the admins', async () => {
    const { service, emitted } = setup(QuoteStatus.DRAFT, []);

    await expect(service.send('q1', client)).rejects.toThrow('Agrega al menos un producto');
    expect((await service.findById('q1')).status).toBe(QuoteStatus.DRAFT);
    expect(emitted).toEqual([]);
  });

  it('sends a quote only once', async () => {
    const { service, emitted } = setup();

    await service.send('q1', client);

    await expect(service.send('q1', client)).rejects.toThrow('Only draft quotes can be sent');
    expect(emitted).toHaveLength(1);
  });

  it('keeps other customers out of a quote', async () => {
    const { service } = setup();

    await expect(service.findOneForUser('q1', otherClient)).rejects.toThrow('does not belong');
    await expect(service.send('q1', otherClient)).rejects.toThrow('does not belong');
    await expect(service.addLine('q1', otherClient, { productId: 'p1', qty: 1 })).rejects.toThrow(
      'does not belong',
    );
    await expect(service.removeLine('q1', 'line-1', otherClient)).rejects.toThrow(
      'does not belong',
    );
    expect(await service.findOneForUser('q1', admin)).toMatchObject({ id: 'q1' });
  });

  it('locks the products once sent', async () => {
    const { service } = setup(QuoteStatus.SENT);

    await expect(service.addLine('q1', client, { productId: 'p1', qty: 1 })).rejects.toThrow(
      'Only draft quotes can be edited',
    );
    await expect(service.updateLine('q1', 'line-1', client, { qty: 9 })).rejects.toThrow(
      'Only draft quotes can be edited',
    );
    await expect(service.removeLine('q1', 'line-1', client)).rejects.toThrow(
      'Only draft quotes can be edited',
    );
    await expect(service.remove('q1', client)).rejects.toThrow('Only draft quotes can be edited');
  });

  it('refuses a product without a retail price', async () => {
    const { service } = setup(QuoteStatus.DRAFT, []);

    await expect(service.addLine('q1', client, { productId: 'no-price', qty: 1 })).rejects.toThrow(
      'Sin precio no está disponible para la venta',
    );
  });

  it('changes a line’s units, or takes it out', async () => {
    const { service } = setup();

    expect((await service.updateLine('q1', 'line-1', client, { qty: 7 })).items[0].qty).toBe(7);
    await expect(service.updateLine('q1', 'nope', client, { qty: 1 })).rejects.toThrow(
      'Quote line not found',
    );
    expect((await service.removeLine('q1', 'line-1', client)).items).toEqual([]);
  });

  it('approves or rejects only a sent quote, and says so', async () => {
    const draft = setup(QuoteStatus.DRAFT);
    await expect(draft.service.approve('q1', admin)).rejects.toThrow('Only sent quotes');
    await expect(draft.service.reject('q1', admin)).rejects.toThrow('Only sent quotes');

    const approved = setup(QuoteStatus.SENT);
    expect((await approved.service.approve('q1', admin)).status).toBe(QuoteStatus.APPROVED);
    expect(approved.emitted).toEqual([
      { event: QUOTE_STATUS_CHANGED_EVENT, payload: { quoteId: 'q1', status: 'approved' } },
    ]);
    await expect(approved.service.reject('q1', admin)).rejects.toThrow('Only sent quotes');

    const rejected = setup(QuoteStatus.SENT);
    const quote = await rejected.service.reject('q1', admin, 'Sin existencia');
    expect(quote).toMatchObject({ status: 'rejected', rejectionReason: 'Sin existencia' });
    expect(rejected.emitted).toEqual([
      { event: QUOTE_STATUS_CHANGED_EVENT, payload: { quoteId: 'q1', status: 'rejected' } },
    ]);
  });

  it('prices each line at its wholesale price and drops the general discount', async () => {
    const { service } = setup(QuoteStatus.SENT, [
      line(),
      line({ id: 'line-2', unitPrice: 3, wholesalePrice: 2 }),
      line({ id: 'line-3', unitPrice: 0, wholesalePrice: 0 }),
    ]);
    await service.setGlobalDiscount('q1', admin, 10);

    const quote = await service.applyWholesalePricing('q1', admin);

    expect(quote.globalDiscountPct).toBe(0);
    expect(quote.items.map((item) => item.discountPct)).toEqual([20, 33.33, 0]);
  });

  it('allows no discount change once approved or rejected', async () => {
    const { service } = setup(QuoteStatus.APPROVED);

    await expect(service.setGlobalDiscount('q1', admin, 5)).rejects.toThrow('finalized');
    await expect(service.applyWholesalePricing('q1', admin)).rejects.toThrow('finalized');
  });
});
