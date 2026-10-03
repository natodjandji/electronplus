import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { OrdersService } from './orders.service';
import { OrderStatus, FulfillmentMethod } from './entities/order.entity';
import { Role } from '../../common/enums/role.enum';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { QuoteStatus } from '../quotes/entities/quote.entity';

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
              currentLevelQty: 0,
              levelExists: false,
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
