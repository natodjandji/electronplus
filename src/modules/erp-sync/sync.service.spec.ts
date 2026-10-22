import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { FinanceService } from '../finance/finance.service';
import { ProductsService } from '../products/products.service';
import { ErpInventoryItem } from './adapters/profit-plus-adapter.interface';
import { ERP_SYNC_ERROR_EVENT, SyncService } from './sync.service';
import { noLinkedStock } from '../../test/no-linked-stock';

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
      findOrCreateForErp: async (_erpCode: string | undefined, label: string) => ({
        id: 'cat',
        code: 'cables',
        label,
      }),
    };
    const sync = new SyncService(
      adapter as never,
      firestore as never,
      new ProductsService(firestore as never, events, noLinkedStock),
      categories as never,
      new FinanceService(firestore as never, events, {} as never),
      {} as never,
      { get: () => undefined } as never,
      events,
    );
    const read = (id: string) => firestore.read(Collections.PRODUCTS, id)!;
    return { sync, adapter, errors, read, firestore };
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

  it('keeps one product per Profit Plus code and leaves out rows without one', async () => {
    const { sync, firestore } = setup(
      [item('A', 4), { ...item('A', 9), name: 'Otro A' }, { ...item(''), name: 'Sin código' }],
      {},
    );
    const log = await sync.runInboundSync();
    expect(log).toMatchObject({ itemsProcessed: 1, itemsSkipped: 2 });
    const products = (await firestore.collection(Collections.PRODUCTS).get()).docs.map((d) =>
      d.data(),
    );
    expect(products).toEqual([
      expect.objectContaining({ erpExternalId: 'A', name: 'Producto A', stock: 4 }),
    ]);
  });

  it('carries a category renamed in Profit Plus to its products', async () => {
    const { sync, read } = setup(
      [{ ...item('A'), categoryLabel: 'Cables y alambres', categoryExternalId: '07' }],
      { A: { erpExternalId: 'A' } },
    );
    const log = await sync.runInboundSync();
    expect(log.itemsProcessed).toBe(1);
    expect(read('A')).toMatchObject({
      categoryId: 'cat',
      category: { id: 'cat', code: 'cables', label: 'Cables y alambres' },
    });
  });

  it('assigns each brand to its supplier: adopts one with the same name, creates the rest', async () => {
    const { sync, read, firestore } = setup(
      [
        { ...item('A'), brand: 'Lucerna', brandExternalId: 'LUC' },
        { ...item('B'), brand: 'Lucerna', brandExternalId: 'LUC' },
        { ...item('C'), brand: 'Philips', brandExternalId: 'PHI' },
        item('D'),
      ],
      { D: { erpExternalId: 'D', supplierId: 'elegido-a-mano' } },
    );
    firestore.seed(Collections.SUPPLIERS, 'luc', { name: 'LUCERNA', taxId: 'J-1' });

    await sync.runInboundSync();
    const suppliers = (await firestore.collection(Collections.SUPPLIERS).get()).docs.map(
      (d) => ({ id: d.id, ...d.data() }) as { id: string; name: string; erpBrandCode?: string },
    );
    expect(suppliers).toHaveLength(2);
    expect(suppliers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'luc', name: 'LUCERNA', erpBrandCode: 'LUC' }),
        expect.objectContaining({ name: 'Philips', erpBrandCode: 'PHI' }),
      ]),
    );
    const philips = suppliers.find((s) => s.erpBrandCode === 'PHI')!;
    expect(read('producto-a')).toMatchObject({ brand: 'Lucerna', supplierId: 'luc' });
    expect(read('producto-b')).toMatchObject({ supplierId: 'luc' });
    expect(read('producto-c')).toMatchObject({ brand: 'Philips', supplierId: philips.id });
    // No brand: the supplier an admin picked stays.
    expect(read('D')).toMatchObject({ supplierId: 'elegido-a-mano' });

    // Renamed here to its legal name: still the same supplier on the next run.
    await firestore.collection(Collections.SUPPLIERS).doc('luc').update({ name: 'Lucerna C.A.' });
    const log = await sync.runInboundSync();
    expect(log.itemsProcessed).toBe(4);
    expect((await firestore.collection(Collections.SUPPLIERS).get()).docs).toHaveLength(2);
    expect(read('producto-a')).toMatchObject({ supplierId: 'luc' });
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

  it('hides the last products when Profit Plus no longer has any, if the catalog is that small', async () => {
    const { sync, read, errors } = setup([], {
      A: { erpExternalId: 'A' },
      B: { erpExternalId: 'B' },
    });
    const log = await sync.runInboundSync();
    expect(log.itemsHidden).toBe(2);
    expect(read('A')).toMatchObject({ active: false });
    expect(read('B')).toMatchObject({ active: false });
    expect(errors).not.toHaveBeenCalled();
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
