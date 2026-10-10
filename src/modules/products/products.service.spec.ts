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

/** Product ids double as public URLs (/product/{id}) and are baked into
 * printed QR labels — see ProductsService.createWithSlugId. */
describe('ProductsService slug ids', () => {
  const CATEGORY = { id: 'cat-1', code: 'cables', label: 'Cables' };

  function setup() {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.CATEGORIES, CATEGORY.id, CATEGORY);
    const service = new ProductsService(
      firestore as unknown as ConstructorParameters<typeof ProductsService>[0],
      new EventEmitter2(),
    );
    const create = (name: string) =>
      service.create({
        sku: `SKU-${name}`,
        name,
        categoryId: CATEGORY.id,
        retailPrice: 1,
        wholesalePrice: 1,
      } as never);
    const erpItem = (externalId: string, name: string) => ({
      externalId,
      sku: externalId,
      name,
      categoryId: CATEGORY.id,
      category: CATEGORY,
      retailPrice: 1,
      wholesalePrice: 1,
      stock: 1,
    });
    return { firestore, service, create, erpItem };
  }

  it('derives the id from the name, stripping accents and punctuation', async () => {
    const { create } = setup();
    expect((await create('Bombillo LED 9W E27 luz fría')).id).toBe('bombillo-led-9w-e27-luz-fria');
  });

  it('suffixes -2/-3 on name collisions without touching the earlier products', async () => {
    const { create, service } = setup();
    const first = await create('Cable 12 AWG');
    const second = await create('Cable 12 AWG');
    const third = await create('cable 12 awg!');
    expect([first.id, second.id, third.id]).toEqual([
      'cable-12-awg',
      'cable-12-awg-2',
      'cable-12-awg-3',
    ]);
    expect((await service.findById('cable-12-awg')).sku).toBe('SKU-Cable 12 AWG');
  });

  it('never lets concurrent ERP upserts with the same name overwrite each other', async () => {
    const { service, erpItem } = setup();
    const results = await Promise.all(
      ['A', 'B', 'C', 'D'].map((x) =>
        service.upsertFromErp(erpItem(`ERP-${x}`, 'Tornillo'), undefined, {
          put: [],
          merge: [],
          remove: [],
        }),
      ),
    );
    const ids = results.map((r) => r.product.id).sort();
    expect(ids).toEqual(['tornillo', 'tornillo-2', 'tornillo-3', 'tornillo-4']);
    const skus = await Promise.all(ids.map(async (id) => (await service.findById(id)).sku));
    expect(new Set(skus)).toEqual(new Set(['ERP-A', 'ERP-B', 'ERP-C', 'ERP-D']));
  });

  it('skips ids that would shadow a static products/ route', async () => {
    const { create } = setup();
    expect((await create('Admin')).id).toBe('admin-2');
    expect((await create('Best Sellers')).id).toBe('best-sellers-2');
  });

  it('truncates long names without leaving a dangling hyphen', async () => {
    const { create } = setup();
    const id = (await create(`${'a'.repeat(79)} bbbbbb`)).id;
    expect(id).toBe('a'.repeat(79));
    expect(id.endsWith('-')).toBe(false);
  });

  it('falls back to "producto" when the name has no usable characters', async () => {
    const { create } = setup();
    expect((await create('¿¡?!')).id).toBe('producto');
  });

  it('keeps the id stable when the name is edited later', async () => {
    const { create, service } = setup();
    const product = await create('Breaker 20A');
    const updated = await service.update(product.id, { name: 'Breaker 20A Bipolar' } as never);
    expect(updated.id).toBe('breaker-20a');
  });
});

/** Whole-catalog reads go through the catalog snapshot (CollectionSnapshot)
 * — these pin down both what they return and what they cost in reads. */
describe('ProductsService catalog snapshot', () => {
  const CATEGORY = { id: 'c1', code: 'cables', label: 'Cables' };

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
      name: `Producto ${id}`,
      stock: 10,
      active: true,
      category: CATEGORY,
      categoryId: CATEGORY.id,
      retailPrice: 5,
      wholesalePrice: 4,
      erpExternalId: `ERP-${id}`,
      qrToken: `qr-${id}`,
      ...overrides,
    });
  }

  const productReads = (firestore: FakeFirestore) =>
    firestore.reads.filter((path) => path.startsWith(`${Collections.PRODUCTS}/`));

  it('serves listing, search and product pages from memory once warm', async () => {
    const firestore = new FakeFirestore();
    for (let i = 10; i < 40; i++) seedProduct(firestore, `p${i}`);
    seedProduct(firestore, 'hidden', { active: false });
    const service = buildService(firestore);

    const page = await service.findAll({ page: 1, limit: 10 } as never);
    expect(page.total).toBe(30);
    expect(page.data.map((p) => p.id)).toEqual(Array.from({ length: 10 }, (_, i) => `p${10 + i}`));

    firestore.reads.length = 0;
    const search = await service.findAll({ page: 1, limit: 10, search: 'p2' } as never);
    expect(search.total).toBe(10);
    expect((await service.findPublicById('p33')).name).toBe('Producto p33');
    expect(await service.activeCatalog()).toHaveLength(30);
    expect(firestore.reads).toHaveLength(0);
  });

  it('shows admin writes immediately, on this instance and the next one', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.CATEGORIES, CATEGORY.id, CATEGORY);
    seedProduct(firestore, 'old');
    const service = buildService(firestore);
    await service.activeCatalog();

    const created = await service.create({
      sku: 'NEW',
      name: 'Breaker 20A',
      categoryId: CATEGORY.id,
      retailPrice: 9,
      wholesalePrice: 8,
    } as never);
    await service.update('old', { name: 'Renombrado' } as never);
    await service.adjustStock('old', { delta: -4 } as never);

    const names = (await service.activeCatalog()).map((p) => p.name);
    expect(names).toEqual(['Breaker 20A', 'Renombrado']);

    const otherInstance = buildService(firestore);
    const admin = await otherInstance.adminFindAll({} as never);
    expect(admin.find((p) => p.id === 'old')).toMatchObject({ name: 'Renombrado', stock: 6 });

    await service.delete(created.id);
    expect((await otherInstance.adminFindAll({} as never)).map((p) => p.id)).toEqual(['old']);
  });

  it('a product deleted from the console leaves the list once the admin deletes or edits it', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'fantasma');
    seedProduct(firestore, 'otro');
    const service = buildService(firestore);
    await service.adminFindAll({} as never);
    await firestore.collection(Collections.PRODUCTS).doc('fantasma').delete();
    await firestore.collection(Collections.PRODUCTS).doc('otro').delete();
    expect((await service.adminFindAll({} as never)).map((p) => p.id).sort()).toEqual([
      'fantasma',
      'otro',
    ]);

    await expect(service.delete('fantasma')).resolves.toBeUndefined();
    await expect(service.update('otro', { name: 'x' } as never)).rejects.toThrow(NotFoundException);
    expect(await buildService(firestore).adminFindAll({} as never)).toEqual([]);
    expect(firestore.read(Collections.PRODUCTS, 'otro')).toBeUndefined();
  });

  it('ERP upserts: unchanged items cost nothing, changes reach the snapshot, manual cost survives', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'cable', { cost: 3, stock: 1 });
    const service = buildService(firestore);
    const { byErpExternalId } = await service.findAllForErpMatching();
    const existing = byErpExternalId.get('ERP-cable')!;
    const item = {
      externalId: 'ERP-cable',
      sku: existing.sku,
      name: existing.name,
      categoryId: CATEGORY.id,
      category: CATEGORY,
      retailPrice: 5,
      wholesalePrice: 4,
      stock: 1,
    };

    firestore.reads.length = 0;
    const changes = { put: [], merge: [], remove: [] };
    const unchanged = await service.upsertFromErp(item, existing, changes);
    expect(unchanged.wrote).toBe(false);

    const changed = await service.upsertFromErp({ ...item, stock: 7 }, existing, changes);
    expect(changed.wrote).toBe(true);
    expect(productReads(firestore)).toHaveLength(0);
    await service.applyCatalogChanges(changes);

    expect(firestore.read(Collections.PRODUCTS, 'cable')).toMatchObject({ stock: 7, cost: 3 });
    const fromSnapshot = (await buildService(firestore).adminFindAll({} as never))[0];
    expect(fromSnapshot).toMatchObject({ stock: 7, cost: 3 });
  });

  it('ERP upsert of a product deleted since the snapshot recreates it whole', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'producto-borrado', { name: 'Producto borrado' });
    const service = buildService(firestore);
    const { byErpExternalId } = await service.findAllForErpMatching();
    const existing = byErpExternalId.get('ERP-producto-borrado')!;
    await firestore.collection(Collections.PRODUCTS).doc('producto-borrado').delete();

    const changes = { put: [], merge: [], remove: [] };
    const result = await service.upsertFromErp(
      {
        externalId: 'ERP-producto-borrado',
        sku: 'SKU-x',
        name: 'Producto borrado',
        categoryId: CATEGORY.id,
        category: CATEGORY,
        retailPrice: 6,
        wholesalePrice: 5,
        stock: 2,
      },
      existing,
      changes,
    );
    await service.applyCatalogChanges(changes);

    expect(result.product.id).toBe('producto-borrado');
    expect(firestore.read(Collections.PRODUCTS, 'producto-borrado')).toMatchObject({
      active: true,
      stock: 2,
    });
    const listed = await buildService(firestore).adminFindAll({} as never);
    expect(listed.map((p) => p.id)).toEqual(['producto-borrado']);
  });

  it('best sellers: ranks once, shares the ranking, and fills from the catalog', async () => {
    const firestore = new FakeFirestore();
    for (const id of ['a', 'b', 'c', 'd']) seedProduct(firestore, id);
    seedProduct(firestore, 'inactive', { active: false });
    const recent = new Date();
    firestore.seed(Collections.ORDERS, 'o1', {
      status: 'paid',
      createdAt: recent,
      items: [
        { productId: 'c', qty: 5 },
        { productId: 'inactive', qty: 50 },
      ],
    });
    firestore.seed(Collections.ORDERS, 'o2', {
      status: 'paid',
      createdAt: recent,
      items: [{ productId: 'b', qty: 2 }],
    });

    const top = await buildService(firestore).topSelling(3);
    expect(top.map((p) => p.id)).toEqual(['c', 'b', 'a']);

    firestore.reads.length = 0;
    const again = await buildService(firestore).topSelling(3);
    expect(again.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(
      firestore.reads.filter((path) => path.startsWith(`${Collections.ORDERS}/`)),
    ).toHaveLength(0);
  });
});
