import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import type { StockChangedEvent } from '../products/products.service';
import { STOCK_ALERT_RAISED_EVENT, InventoryService } from './inventory.service';

describe('InventoryService stock alerts', () => {
  function build() {
    const firestore = new FakeFirestore();
    const events = { emit: jest.fn() };
    const config = { get: () => 10 };
    const service = new InventoryService(
      firestore as never,
      {} as never,
      events as never,
      config as never,
    );
    return { firestore, events, service };
  }

  const change = (overrides: Partial<StockChangedEvent>): StockChangedEvent => ({
    productId: 'p1',
    sku: 'P-1',
    name: 'Breaker 20A',
    stock: 50,
    ...overrides,
  });

  async function activeAlerts(firestore: FakeFirestore) {
    const snap = await firestore
      .collection(Collections.STOCK_ALERTS)
      .where('active', '==', true)
      .get();
    return snap.docs.map((d) => d.data());
  }

  it('skips the lookup when a sync moves stock that stays above the threshold', async () => {
    const { firestore, service } = build();
    let queried = false;
    const original = firestore.collection.bind(firestore);
    jest.spyOn(firestore, 'collection').mockImplementation((path: string) => {
      if (path === Collections.STOCK_ALERTS) queried = true;
      return original(path);
    });

    await service.handleStockChanged(change({ previousStock: 40, stock: 35 }));
    expect(queried).toBe(false);

    await service.handleStockChanged(change({ previousStock: 12, stock: 9 }));
    expect(queried).toBe(true);
  });

  it('raises and announces an alert when stock drops to the threshold', async () => {
    const { firestore, events, service } = build();
    await service.handleStockChanged(change({ previousStock: 12, stock: 0 }));
    expect(await activeAlerts(firestore)).toEqual([
      expect.objectContaining({ productId: 'p1', level: 'out', active: true }),
    ]);
    expect(events.emit).toHaveBeenCalledWith(
      STOCK_ALERT_RAISED_EVENT,
      expect.objectContaining({ productId: 'p1', stock: 0 }),
    );
  });

  it('lists a product imported already low without announcing it', async () => {
    const { firestore, events, service } = build();
    await service.handleStockChanged(change({ imported: true, stock: 3 }));
    expect(await activeAlerts(firestore)).toHaveLength(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('resolves an open alert once stock is back above the threshold', async () => {
    const { firestore, service } = build();
    await service.handleStockChanged(change({ previousStock: 12, stock: 4 }));
    await service.handleStockChanged(change({ previousStock: 4, stock: 30 }));
    expect(await activeAlerts(firestore)).toEqual([]);
  });
});
