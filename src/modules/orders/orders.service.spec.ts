import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { OrdersService } from './orders.service';
import { OrderStatus, FulfillmentMethod } from './entities/order.entity';

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
      {} as ConstructorParameters<typeof OrdersService>[5],
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
      emitStockChanged: jest.fn(),
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
    expect(productsService.emitStockChanged).toHaveBeenCalledTimes(1);
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
    productsService.emitStockChanged.mockClear();

    await expect(service.cancel(orderId)).rejects.toThrow(BadRequestException);
    await expect(service.cancel(orderId)).rejects.toThrow('This order cannot be cancelled');

    // The guard re-read fresh state from inside the transaction and bailed
    // before touching stock a second time.
    expect(productsService.applyStockDelta).not.toHaveBeenCalled();
    expect(productsService.emitStockChanged).not.toHaveBeenCalled();
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
