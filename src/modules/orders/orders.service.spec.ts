import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { ProductsService } from '../products/products.service';
import { ORDER_PAID_EVENT, OrdersService } from './orders.service';
import { OrderStatus, FulfillmentMethod } from './entities/order.entity';
import { Role } from '../../common/enums/role.enum';
import { PaymentMethod, PaymentStatus } from '../payments/entities/payment.entity';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { noLinkedStock } from '../../test/no-linked-stock';

/** Regression tests for cancel() running as a single Firestore transaction
 * instead of a check-then-write outside one — the bug was that two
 * concurrent cancel requests for the same order could both pass the status
 * check before either write landed, double-crediting stock for every item. */
describe('OrdersService.cancel', () => {
  const orderId = 'order-1';

  function buildService(firestore: FakeFirestore, productsService: Record<string, jest.Mock>) {
    return new OrdersService(
      firestore as unknown as ConstructorParameters<typeof OrdersService>[0],
      productsService as unknown as ConstructorParameters<typeof OrdersService>[1],
      {} as ConstructorParameters<typeof OrdersService>[2],
      {} as ConstructorParameters<typeof OrdersService>[3],
      {} as ConstructorParameters<typeof OrdersService>[4],
      new DiscountCodesService(firestore as never),
      {} as ConstructorParameters<typeof OrdersService>[6],
      new EventEmitter2(),
      noLinkedStock,
    );
  }

  function seedPaidOrder(firestore: FakeFirestore) {
    firestore.seed(Collections.ORDERS, orderId, {
      userId: 'user-1',
      status: OrderStatus.PAID,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      items: [{ productId: 'p1', qty: 2 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function fakeProductsService() {
    return {
      getStockForUpdateMany: jest.fn().mockResolvedValue(
        new Map([
          [
            'p1',
            {
              productId: 'p1',
              productRef: { id: 'p1' },
              currentStock: 10,
              sku: 'SKU-1',
              name: 'Product 1',
            },
          ],
        ]),
      ),
      applyStockDelta: jest.fn().mockReturnValue({
        productId: 'p1',
        sku: 'SKU-1',
        name: 'Product 1',
        stock: 12,
      }),
      stockCommitted: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('cancels a paid order and credits stock back exactly once', async () => {
    const firestore = new FakeFirestore();
    seedPaidOrder(firestore);
    const productsService = fakeProductsService();
    const service = buildService(firestore, productsService);

    const result = await service.cancel(orderId);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(productsService.applyStockDelta).toHaveBeenCalledTimes(1);
    expect(productsService.applyStockDelta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ productId: 'p1' }),
      2, // +qty credited back
    );
    expect(productsService.stockCommitted).toHaveBeenCalledTimes(1);
    expect(productsService.stockCommitted).toHaveBeenCalledWith([
      expect.objectContaining({ productId: 'p1', stock: 12 }),
    ]);
  });

  it('rejects cancelling an order that is already cancelled, without crediting stock again', async () => {
    const firestore = new FakeFirestore();
    seedPaidOrder(firestore);
    const productsService = fakeProductsService();
    const service = buildService(firestore, productsService);

    // First cancel succeeds and commits status: cancelled inside the fake's
    // single-threaded transaction — simulating the second of two concurrent
    // requests arriving just after the first one's write landed.
    await service.cancel(orderId);
    productsService.applyStockDelta.mockClear();
    productsService.stockCommitted.mockClear();

    await expect(service.cancel(orderId)).rejects.toThrow(BadRequestException);
    await expect(service.cancel(orderId)).rejects.toThrow('This order cannot be cancelled');

    // The guard re-read fresh state from inside the transaction and bailed
    // before touching stock a second time.
    expect(productsService.applyStockDelta).not.toHaveBeenCalled();
    expect(productsService.stockCommitted).not.toHaveBeenCalled();
  });

  it('gives the order its discount-code use back', async () => {
    const firestore = new FakeFirestore();
    seedPaidOrder(firestore);
    firestore.seed(Collections.ORDERS, orderId, {
      ...firestore.read(Collections.ORDERS, orderId),
      discountCode: 'PROMO',
    });
    firestore.seed(Collections.DISCOUNT_CODES, 'PROMO', { code: 'PROMO', usedCount: 3 });
    const service = buildService(firestore, fakeProductsService());

    await service.cancel(orderId);

    expect(firestore.read(Collections.DISCOUNT_CODES, 'PROMO')?.usedCount).toBe(2);
  });

  it('rejects cancelling a fulfilled order', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.ORDERS, orderId, {
      userId: 'user-1',
      status: OrderStatus.FULFILLED,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      items: [{ productId: 'p1', qty: 2 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const productsService = fakeProductsService();
    const service = buildService(firestore, productsService);

    await expect(service.cancel(orderId)).rejects.toThrow(BadRequestException);
    expect(productsService.applyStockDelta).not.toHaveBeenCalled();
  });
});

/** Checkout must hold even against requests crafted by hand: the API takes
 * payment method, product ids and quote ids straight from the client. */
describe('OrdersService checkout guards', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };
  const product = {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Product 1',
    category: { id: 'c1', code: 'c1', label: 'Cat' },
    retailPrice: 100,
    wholesalePrice: 80,
    stock: 10,
    active: true,
  };
  const pickup = { fullName: 'Cliente', phone: '0414' };

  function build(firestore: FakeFirestore, quotesService: Record<string, jest.Mock> = {}) {
    const productsService = {
      getForUpdateMany: jest
        .fn()
        .mockResolvedValue(new Map([['p1', { ref: { id: 'p1' }, product }]])),
      assertPurchasable: jest.fn(),
      reserveStock: jest.fn().mockReturnValue(9),
      stockCommitted: jest.fn().mockResolvedValue(undefined),
    };
    const paymentsService = { initiate: jest.fn() };
    const service = new OrdersService(
      firestore as unknown as ConstructorParameters<typeof OrdersService>[0],
      productsService as unknown as ConstructorParameters<typeof OrdersService>[1],
      { priceFor: (p: { retailPrice: number }) => p.retailPrice } as never,
      paymentsService as never,
      {} as never,
      {} as never,
      quotesService as never,
      new EventEmitter2(),
      noLinkedStock,
    );
    return { service, productsService, paymentsService };
  }

  it('refuses credit_b2b for an account without a credit line, before reserving stock', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.USERS, client.id, { role: Role.CLIENT });
    const { service, productsService } = build(firestore);

    await expect(
      service.create(client, {
        items: [{ productId: 'p1', qty: 1 }],
        paymentMethod: PaymentMethod.CREDIT_B2B,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(productsService.getForUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses credit_b2b above the account credit line', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.USERS, client.id, { role: Role.CLIENT, creditLimit: 50 });
    const { service, paymentsService } = build(firestore);

    await expect(
      service.create(client, {
        items: [{ productId: 'p1', qty: 1 }],
        paymentMethod: PaymentMethod.CREDIT_B2B,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow('supera tu línea de crédito');
    expect(paymentsService.initiate).not.toHaveBeenCalled();
  });

  it('caps how many unpaid orders one client can hold', async () => {
    const firestore = new FakeFirestore();
    for (let i = 0; i < 5; i++) {
      firestore.seed(Collections.ORDERS, `o${i}`, {
        userId: client.id,
        status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
      });
    }
    const { service, productsService } = build(firestore);

    await expect(
      service.create(client, {
        items: [{ productId: 'p1', qty: 1 }],
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow(ConflictException);
    expect(productsService.getForUpdateMany).not.toHaveBeenCalled();
  });

  it('checks every product is purchasable', async () => {
    const firestore = new FakeFirestore();
    const { service, productsService } = build(firestore);
    productsService.assertPurchasable.mockImplementation(() => {
      throw new BadRequestException('no está disponible');
    });

    await expect(
      service.create(client, {
        items: [{ productId: 'p1', qty: 1 }],
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow('no está disponible');
    expect(productsService.reserveStock).not.toHaveBeenCalled();
  });

  it('re-checks the quote inside the transaction, so one approval converts once', async () => {
    const firestore = new FakeFirestore();
    const approved = {
      id: 'q1',
      userId: client.id,
      status: QuoteStatus.APPROVED,
      globalDiscountPct: 0,
      items: [{ id: 'l1', productId: 'p1', qty: 1, unitPrice: 100, discountPct: 50 }],
    };
    // The store already says converted — a concurrent checkout got there
    // after this request's own (stale) read.
    firestore.seed(Collections.QUOTES, 'q1', { ...approved, convertedOrderId: 'other-order' });
    const { service, productsService } = build(firestore, {
      findOneForUser: jest.fn().mockResolvedValue(approved),
    });

    await expect(
      service.createFromQuote('q1', client, {
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow(ConflictException);
    expect(productsService.reserveStock).not.toHaveBeenCalled();
  });
});

/** A payment can be confirmed twice (credit B2B is verified at checkout and
 * its payment.verified event arrives as well). Only the first confirmation
 * may flag the sale for the ERP and fire the paid events. */
describe('OrdersService.markPaid', () => {
  function build(status: OrderStatus, extra: Record<string, unknown> = {}) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.ORDERS, 'order-1', {
      userId: 'user-1',
      status,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    });
    const events = new EventEmitter2();
    const paid = jest.fn();
    events.on(ORDER_PAID_EVENT, paid);
    const service = new OrdersService(
      firestore as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new DiscountCodesService(firestore as never),
      {} as never,
      events,
      noLinkedStock,
    );
    return { service, paid, read: () => firestore.read(Collections.ORDERS, 'order-1')! };
  }

  it('marks a pending order paid and flags the sale for the ERP', async () => {
    const { service, paid, read } = build(OrderStatus.PENDING_PAYMENT_VERIFICATION);
    expect((await service.markPaid('order-1')).status).toBe(OrderStatus.PAID);
    expect(read()).toMatchObject({ status: OrderStatus.PAID, erpExportPending: true });
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it('does nothing the second time, so the sale is not reported twice', async () => {
    const { service, paid, read } = build(OrderStatus.PENDING_PAYMENT_VERIFICATION);
    await service.markPaid('order-1');
    // The ERP export ran in between and cleared the flag.
    read().erpExportPending = false;
    await service.markPaid('order-1');
    expect(paid).toHaveBeenCalledTimes(1);
    expect(read().erpExportPending).toBe(false);
  });

  it('leaves an order further down the pipeline untouched', async () => {
    const { service, paid, read } = build(OrderStatus.SHIPPED, { erpExportPending: false });
    expect((await service.markPaid('order-1')).status).toBe(OrderStatus.SHIPPED);
    expect(read()).toMatchObject({ status: OrderStatus.SHIPPED, erpExportPending: false });
    expect(paid).not.toHaveBeenCalled();
  });

  it('keeps a cancelled order cancelled: its stock was already released', async () => {
    const { service, paid, read } = build(OrderStatus.CANCELLED);
    expect((await service.markPaid('order-1')).status).toBe(OrderStatus.CANCELLED);
    expect(read().erpExportPending).toBeUndefined();
    expect(paid).not.toHaveBeenCalled();
  });
});

/** Stock through the real ProductsService: an order or quote can list one
 * product on two lines, and a transaction that writes a product's stock
 * twice keeps only the last write. */
describe('OrdersService stock per product', () => {
  const client = { id: 'client-1', email: 'c@example.com', role: Role.CLIENT };
  const pickup = { fullName: 'Cliente', phone: '0414' };

  function setup(linked: Record<string, number> = {}) {
    const linkedStock = { unitsByProduct: async () => linked } as never;
    const firestore = new FakeFirestore();
    const product = (id: string, stock: number) =>
      firestore.seed(Collections.PRODUCTS, id, {
        sku: `SKU-${id}`,
        name: `Producto ${id}`,
        category: { id: 'c1', code: 'c1', label: 'Cat' },
        retailPrice: 10,
        wholesalePrice: 8,
        stock,
        active: true,
      });
    const events = new EventEmitter2();
    const productsService = new ProductsService(firestore as never, events, linkedStock);
    const quotesService = { findOneForUser: jest.fn() };
    const service = new OrdersService(
      firestore as never,
      productsService,
      { priceFor: (p: { retailPrice: number }) => p.retailPrice } as never,
      { initiate: jest.fn().mockResolvedValue({ status: 'pending' }) } as never,
      {} as never,
      new DiscountCodesService(firestore as never),
      quotesService as never,
      events,
      linkedStock,
    );
    const stock = (id: string) => firestore.read(Collections.PRODUCTS, id)!.stock;
    return { firestore, product, service, quotesService, stock };
  }

  it('reserves every line of a product a quote lists twice', async () => {
    const { firestore, product, service, quotesService, stock } = setup();
    product('p1', 10);
    const quote = {
      id: 'q1',
      userId: client.id,
      status: QuoteStatus.APPROVED,
      globalDiscountPct: 0,
      items: [
        { id: 'l1', productId: 'p1', qty: 3, unitPrice: 10, discountPct: 0 },
        { id: 'l2', productId: 'p1', qty: 4, unitPrice: 10, discountPct: 0 },
      ],
    };
    firestore.seed(Collections.QUOTES, 'q1', quote);
    quotesService.findOneForUser.mockResolvedValue(quote);

    const order = await service.createFromQuote('q1', client, {
      paymentMethod: PaymentMethod.CASH,
      fulfillmentMethod: FulfillmentMethod.PICKUP,
      shipping: pickup,
    });

    expect(stock('p1')).toBe(3);
    expect(order.items).toHaveLength(2);
    expect(order.subtotal).toBe(70);
  });

  it('refuses a quote whose two lines of a product together exceed its stock', async () => {
    const { firestore, product, service, quotesService, stock } = setup();
    product('p1', 5);
    const quote = {
      id: 'q1',
      userId: client.id,
      status: QuoteStatus.APPROVED,
      globalDiscountPct: 0,
      items: [
        { id: 'l1', productId: 'p1', qty: 3, unitPrice: 10, discountPct: 0 },
        { id: 'l2', productId: 'p1', qty: 3, unitPrice: 10, discountPct: 0 },
      ],
    };
    firestore.seed(Collections.QUOTES, 'q1', quote);
    quotesService.findOneForUser.mockResolvedValue(quote);

    await expect(
      service.createFromQuote('q1', client, {
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow(ConflictException);
    expect(stock('p1')).toBe(5);
  });

  it('refuses a quote with a product the store stopped selling since', async () => {
    const { firestore, product, service, quotesService } = setup();
    product('p1', 10);
    firestore.read(Collections.PRODUCTS, 'p1')!.active = false;
    const quote = {
      id: 'q1',
      userId: client.id,
      status: QuoteStatus.APPROVED,
      globalDiscountPct: 0,
      items: [{ id: 'l1', productId: 'p1', qty: 1, unitPrice: 10, discountPct: 0 }],
    };
    firestore.seed(Collections.QUOTES, 'q1', quote);
    quotesService.findOneForUser.mockResolvedValue(quote);

    await expect(
      service.createFromQuote('q1', client, {
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cancels an order with a product deleted since, giving back the rest once per product', async () => {
    const { firestore, product, service, stock } = setup();
    product('p1', 1);
    firestore.seed(Collections.ORDERS, 'o1', {
      userId: client.id,
      status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
      items: [
        { productId: 'p1', qty: 2 },
        { productId: 'p1', qty: 3 },
        { productId: 'borrado', qty: 4 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect((await service.cancel('o1')).status).toBe(OrderStatus.CANCELLED);
    expect(stock('p1')).toBe(6);
  });

  it("sells what the main store lacks from the second store's linked units", async () => {
    const { product, service, stock } = setup({ p1: 5 });
    product('p1', 3);

    const order = await service.create(client, {
      items: [{ productId: 'p1', qty: 7 }],
      paymentMethod: PaymentMethod.CASH,
      fulfillmentMethod: FulfillmentMethod.PICKUP,
      shipping: pickup,
    });

    expect(stock('p1')).toBe(0);
    expect(order.items[0]).toEqual(expect.objectContaining({ qty: 7, secondStoreQty: 4 }));
  });

  it('refuses more than both stores hold together', async () => {
    const { product, service, stock } = setup({ p1: 2 });
    product('p1', 3);

    await expect(
      service.create(client, {
        items: [{ productId: 'p1', qty: 6 }],
        paymentMethod: PaymentMethod.CASH,
        fulfillmentMethod: FulfillmentMethod.PICKUP,
        shipping: pickup,
      }),
    ).rejects.toThrow('5 available, 6 requested');
    expect(stock('p1')).toBe(3);
  });

  it("puts a quote's second-store units on the product's first lines", async () => {
    const { firestore, product, service, quotesService, stock } = setup({ p1: 5 });
    product('p1', 2);
    const quote = {
      id: 'q1',
      userId: client.id,
      status: QuoteStatus.APPROVED,
      globalDiscountPct: 0,
      items: [
        { id: 'l1', productId: 'p1', qty: 3, unitPrice: 10, discountPct: 0 },
        { id: 'l2', productId: 'p1', qty: 3, unitPrice: 10, discountPct: 0 },
      ],
    };
    firestore.seed(Collections.QUOTES, 'q1', quote);
    quotesService.findOneForUser.mockResolvedValue(quote);

    const order = await service.createFromQuote('q1', client, {
      paymentMethod: PaymentMethod.CASH,
      fulfillmentMethod: FulfillmentMethod.PICKUP,
      shipping: pickup,
    });

    expect(stock('p1')).toBe(0);
    expect(order.items.map((i) => i.secondStoreQty)).toEqual([3, 1]);
  });

  it('gives the main store back only the units that came off it', async () => {
    const { firestore, product, service, stock } = setup();
    product('p1', 0);
    firestore.seed(Collections.ORDERS, 'o1', {
      userId: client.id,
      status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
      items: [{ productId: 'p1', qty: 7, secondStoreQty: 4 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.cancel('o1');
    expect(stock('p1')).toBe(3);
  });
});

/** Cashea: the buyer's cédula is checked before an order exists, and an
 * unconfirmed Cashea payment can be swapped for another method. */
describe('OrdersService · Cashea', () => {
  const buyer = { id: 'user-1', email: 'buyer@test.com', role: Role.CLIENT };

  function build(payments: Record<string, jest.Mock>) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.ORDERS, 'order-1', {
      userId: buyer.id,
      status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
      paymentMethod: PaymentMethod.CASHEA,
      shippingTaxId: 'V-12345678',
      totalAmount: 58,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const productsService = { getForUpdateMany: jest.fn() };
    const service = new OrdersService(
      firestore as never,
      productsService as never,
      {} as never,
      payments as never,
      {} as never,
      new DiscountCodesService(firestore as never),
      {} as never,
      new EventEmitter2(),
      noLinkedStock,
    );
    return { service, productsService, firestore };
  }

  it('refuses Cashea with a company RIF before reserving anything', async () => {
    const payments = { initiate: jest.fn() };
    const { service, productsService } = build(payments);
    await expect(
      service.create(buyer, {
        items: [{ productId: 'p1', qty: 1 }],
        paymentMethod: PaymentMethod.CASHEA,
        shipping: { fullName: 'Empresa', phone: '0414-0000000', taxId: 'J-12345678-9' },
      }),
    ).rejects.toThrow('Para pagar con Cashea usa tu cédula (V o E)');
    expect(productsService.getForUpdateMany).not.toHaveBeenCalled();
    expect(payments.initiate).not.toHaveBeenCalled();
  });

  it('cancels the pending Cashea payment before switching to another method', async () => {
    const order: string[] = [];
    const payments = {
      findByOrder: jest
        .fn()
        .mockResolvedValue([{ method: PaymentMethod.CASHEA, status: PaymentStatus.PENDING }]),
      withdrawCashea: jest.fn(async () => void order.push('withdraw')),
      initiate: jest.fn(async () => {
        order.push('initiate');
        return { status: PaymentStatus.PENDING };
      }),
    };
    const { service, firestore } = build(payments);
    await service.retryPayment('order-1', buyer, {
      paymentMethod: PaymentMethod.PAGO_MOVIL,
      paymentReference: '123456',
    });
    expect(order).toEqual(['withdraw', 'initiate']);
    expect(firestore.read(Collections.ORDERS, 'order-1')!.paymentMethod).toBe(
      PaymentMethod.PAGO_MOVIL,
    );
  });

  it('still refuses to retry a payment that is pending verification', async () => {
    const payments = {
      findByOrder: jest
        .fn()
        .mockResolvedValue([{ method: PaymentMethod.PAGO_MOVIL, status: PaymentStatus.PENDING }]),
      withdrawCashea: jest.fn(),
    };
    const { service } = build(payments);
    await expect(
      service.retryPayment('order-1', buyer, { paymentMethod: PaymentMethod.CASHEA }),
    ).rejects.toThrow('Only a rejected payment can be retried');
    expect(payments.withdrawCashea).not.toHaveBeenCalled();
  });
});
