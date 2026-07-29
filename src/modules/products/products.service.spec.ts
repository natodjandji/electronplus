import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ProductsService } from './products.service';

/** Regression coverage for getForUpdateMany/getStockForUpdateMany — the
 * batched tx.getAll() replacements for what used to be one tx.get() per
 * order line. Runs against a real ProductsService (not a mock) so the
 * actual read/map-building logic is exercised, not just its call shape. */
describe('ProductsService batched transaction reads', () => {
  function buildService(firestore: FakeFirestore) {
    return new ProductsService(
      firestore as unknown as ConstructorParameters<typeof ProductsService>[0],
      new EventEmitter2(),
    );
  }

  function seedProduct(
    firestore: FakeFirestore,
    id: string,
    overrides: Record<string, unknown> = {},
  ) {
    firestore.seed(Collections.PRODUCTS, id, {
      sku: `SKU-${id}`,
      name: `Product ${id}`,
      stock: 10,
      active: true,
      category: { id: 'c1', code: 'cables', label: 'Cables' },
      categoryId: 'c1',
      retailPrice: 5,
      wholesalePrice: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  it('getForUpdateMany resolves every product keyed by id, same shape as getForUpdate', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'p1', { stock: 10 });
    seedProduct(firestore, 'p2', { stock: 20 });
    const service = buildService(firestore);

    const result = await firestore.runTransaction((tx) =>
      service.getForUpdateMany(tx as never, ['p1', 'p2']),
    );

    expect(result.size).toBe(2);
    expect(result.get('p1')?.product.stock).toBe(10);
    expect(result.get('p1')?.product.sku).toBe('SKU-p1');
    expect(result.get('p2')?.product.stock).toBe(20);
  });

  it('getForUpdateMany throws NotFoundException if any id is missing, same as getForUpdate', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'p1');
    const service = buildService(firestore);

    await expect(
      firestore.runTransaction((tx) =>
        service.getForUpdateMany(tx as never, ['p1', 'does-not-exist']),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('getForUpdateMany resolves duplicate ids in an order without erroring', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'p1', { stock: 10 });
    const service = buildService(firestore);

    const result = await firestore.runTransaction((tx) =>
      service.getForUpdateMany(tx as never, ['p1', 'p1']),
    );

    expect(result.size).toBe(1);
    expect(result.get('p1')?.product.stock).toBe(10);
  });

  it('getStockForUpdateMany resolves stock context per product, no warehouse level', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'p1', { stock: 7, sku: 'SKU-A', name: 'Widget' });
    const service = buildService(firestore);

    const result = await firestore.runTransaction((tx) =>
      service.getStockForUpdateMany(tx as never, ['p1']),
    );

    const ctx = result.get('p1');
    expect(ctx).toMatchObject({
      productId: 'p1',
      currentStock: 7,
      sku: 'SKU-A',
      name: 'Widget',
      levelExists: false,
      levelRef: undefined,
    });
  });

  it('getStockForUpdateMany throws NotFoundException if any id is missing', async () => {
    const firestore = new FakeFirestore();
    const service = buildService(firestore);

    await expect(
      firestore.runTransaction((tx) => service.getStockForUpdateMany(tx as never, ['ghost'])),
    ).rejects.toThrow(NotFoundException);
  });

  describe('getStockForUpdateManyForWarehouse', () => {
    function seedWarehouse(firestore: FakeFirestore, id: string) {
      firestore.seed(Collections.WAREHOUSES, id, {
        code: 'DEP-A',
        name: 'Depósito A',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    function seedStockLevel(
      firestore: FakeFirestore,
      productId: string,
      warehouseId: string,
      quantity: number,
    ) {
      firestore.seed(
        `${Collections.PRODUCTS}/${productId}/${Collections.STOCK_LEVELS}`,
        warehouseId,
        {
          productId,
          warehouseId,
          warehouse: { id: warehouseId, code: 'DEP-A', name: 'Depósito A' },
          quantity,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );
    }

    it('reuses an existing stock-level doc without needing the warehouse doc', async () => {
      const firestore = new FakeFirestore();
      seedProduct(firestore, 'p1', { stock: 50 });
      seedStockLevel(firestore, 'p1', 'wh-1', 15);
      const service = buildService(firestore);

      const result = await firestore.runTransaction((tx) =>
        service.getStockForUpdateManyForWarehouse(tx as never, ['p1'], 'wh-1'),
      );

      const ctx = result.get('p1');
      expect(ctx?.levelExists).toBe(true);
      expect(ctx?.currentLevelQty).toBe(15);
      // No warehouse doc was seeded — if the implementation looked it up
      // unnecessarily here, warehouseInfo/levelRef would still resolve fine
      // since the level already existed, but a redundant read is exactly
      // what this batching was meant to avoid.
      expect(ctx?.warehouseInfo).toBeUndefined();
    });

    it('resolves the shared warehouse doc once for every item missing a stock level', async () => {
      const firestore = new FakeFirestore();
      seedProduct(firestore, 'p1', { stock: 50, sku: 'SKU-1' });
      seedProduct(firestore, 'p2', { stock: 30, sku: 'SKU-2' });
      seedWarehouse(firestore, 'wh-1');
      const service = buildService(firestore);

      const result = await firestore.runTransaction((tx) =>
        service.getStockForUpdateManyForWarehouse(tx as never, ['p1', 'p2'], 'wh-1'),
      );

      for (const id of ['p1', 'p2']) {
        const ctx = result.get(id);
        expect(ctx?.levelExists).toBe(false);
        expect(ctx?.currentLevelQty).toBe(0);
        expect(ctx?.warehouseInfo).toEqual({ id: 'wh-1', code: 'DEP-A', name: 'Depósito A' });
      }
    });

    it('throws NotFoundException if a product id is missing', async () => {
      const firestore = new FakeFirestore();
      seedWarehouse(firestore, 'wh-1');
      const service = buildService(firestore);

      await expect(
        firestore.runTransaction((tx) =>
          service.getStockForUpdateManyForWarehouse(tx as never, ['ghost'], 'wh-1'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
