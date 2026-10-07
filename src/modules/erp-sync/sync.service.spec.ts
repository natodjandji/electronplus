import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ProductsService } from '../products/products.service';
import { ErpInventoryItem } from './adapters/profit-plus-adapter.interface';
import { ERP_SYNC_ERROR_EVENT, SyncService } from './sync.service';

/** Principal store: products Profit Plus stops sending leave the store
 * (deactivated, not deleted) and come back if they return. */
describe('SyncService and products removed in Profit Plus', () => {
  const item = (code: string, stock = 5): ErpInventoryItem => ({
    externalId: code,
    sku: code,
    name: `Producto ${code}`,
    categoryCode: 'cables',
    categoryLabel: 'Cables',
    retailPrice: 10,
    wholesalePrice: 8,
    stock,
  });

  function setup(feed: ErpInventoryItem[], products: Record<string, Record<string, unknown>>) {
    const firestore = new FakeFirestore();
    for (const [id, overrides] of Object.entries(products)) {
      firestore.seed(Collections.PRODUCTS, id, {
        sku: id,
        name: `Producto ${id}`,
        stock: 5,
        active: true,
        category: { id: 'cat', code: 'cables', label: 'Cables' },
        categoryId: 'cat',
        retailPrice: 10,
        wholesalePrice: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      });
    }
    const events = new EventEmitter2();
    const errors = jest.fn();
    events.on(ERP_SYNC_ERROR_EVENT, errors);
    const adapter = { fetchInventory: jest.fn(async () => feed), isConfigured: () => true };
    const categories = {
      findOrCreateByCode: async (code: string, label: string) => ({ id: 'cat', code, label }),
    };
    const sync = new SyncService(
      adapter as never,
      firestore as never,
      new ProductsService(firestore as never, events),
      categories as never,
      {} as never,
      { get: () => undefined } as never,
      events,
    );
    const read = (id: string) => firestore.read(Collections.PRODUCTS, id)!;
    return { sync, adapter, errors, read };
  }

  it('hides a product Profit Plus no longer sends and leaves manual products alone', async () => {
    const { sync, read } = setup([item('A'), item('B')], {
      A: { erpExternalId: 'A' },
      B: { erpExternalId: 'B' },
      C: { erpExternalId: 'C' },
      manual: {},
    });
    const log = await sync.runInboundSync();
    expect(log.itemsHidden).toBe(1);
    expect(read('C')).toMatchObject({ active: false });
    expect(read('C').erpRemovedAt).toBeInstanceOf(Date);
    expect(read('A')).toMatchObject({ active: true });
    expect(read('manual')).toMatchObject({ active: true });
  });

  it('brings it back when Profit Plus sends it again', async () => {
    const { sync, read } = setup([item('C', 3)], {
      C: { erpExternalId: 'C', active: false, erpRemovedAt: new Date() },
    });
    await sync.runInboundSync();
    expect(read('C')).toMatchObject({ active: true, erpRemovedAt: null, stock: 3 });
  });

  it("doesn't reactivate a product an admin turned off", async () => {
    const { sync, read } = setup([item('D')], { D: { erpExternalId: 'D', active: false } });
    await sync.runInboundSync();
    expect(read('D')).toMatchObject({ active: false });
  });

  it("doesn't hide again a product an admin turned back on", async () => {
    const removedAt = new Date('2026-10-01');
    const { sync, read } = setup([item('A')], {
      A: { erpExternalId: 'A' },
      E: { erpExternalId: 'E', active: true, erpRemovedAt: removedAt },
    });
    const log = await sync.runInboundSync();
    expect(log.itemsHidden).toBe(0);
    expect(read('E')).toMatchObject({ active: true, erpRemovedAt: removedAt });
  });

  it('hides nothing when too much of the catalog goes missing at once, and says so', async () => {
    const products: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 20; i++) products[`P${i}`] = { erpExternalId: `P${i}` };
    const { sync, errors, read } = setup([item('P0')], products);
    const log = await sync.runInboundSync();
    expect(log.itemsHidden).toBe(0);
    expect(read('P5')).toMatchObject({ active: true });
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('19 productos') }),
    );
  });
});
