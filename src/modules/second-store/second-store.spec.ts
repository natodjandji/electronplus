import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ProductsService } from '../products/products.service';
import { SecondStoreIndex } from './second-store-index';
import { SecondStoreService } from './second-store.service';
import { SecondStoreSyncService } from './second-store-sync.service';
import { SecondStoreProduct } from './entities/second-store-product.entity';
import { matchBridgeProducts } from './second-store-matching';

const BRIDGE_ENV: Record<string, string> = {
  SECOND_STORE_PROFIT_API_URL: 'http://bridge.test',
  SECOND_STORE_PROFIT_API_KEY: 'key',
};

/** Each "instance" gets its own index — like separate Cloud Run instances
 * sharing one Firestore. */
function instance(firestore: FakeFirestore) {
  const fs = firestore as unknown as Firestore;
  const index = new SecondStoreIndex(fs);
  const sync = new SecondStoreSyncService(
    fs,
    {} as never,
    { get: (key: string) => BRIDGE_ENV[key] } as never,
    index,
  );
  const products = new ProductsService(fs, new EventEmitter2());
  const service = new SecondStoreService(fs, products, index);
  return { sync, service };
}

function bridgeReturns(productos: object[]) {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ total: productos.length, productos }), { status: 200 }),
    );
}

const secondStoreReads = (firestore: FakeFirestore) =>
  firestore.reads.filter((path) => path.startsWith(`${Collections.SECOND_STORE_PRODUCTS}/`));

describe('Second store sync + listing over the snapshot', () => {
  afterEach(() => jest.restoreAllMocks());

  it('matches against the snapshot, writes only changes, and the list reflects them', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.SECOND_STORE_PRODUCTS, 'a', {
      name: 'Breaker 20A',
      code: 'B20',
      stock: 4,
      retailPrice: 10,
      wholesalePrice: 9,
      linkedProductId: 'breaker-20a',
    });
    firestore.seed(Collections.SECOND_STORE_PRODUCTS, 'b', {
      name: 'Cable 12',
      code: 'C12',
      stock: 50,
      retailPrice: 2,
      wholesalePrice: 1.5,
    });
    firestore.seed(Collections.PRODUCTS, 'breaker-20a', {
      sku: 'BRK-20',
      name: 'Breaker 20A',
      stock: 7,
      active: true,
    });

    bridgeReturns([
      { codigo: 'B20', descripcion: 'Breaker 20A', stock: 4, precio1: 10, precio2: 9 },
      { codigo: 'C12', descripcion: 'Cable 12', stock: 45, precio1: 2, precio2: 1.5 },
      { codigo: 'T1', descripcion: 'Toma doble', stock: 8, precio1: 3, precio2: 2.5 },
    ]);
    const first = instance(firestore);
    expect(await first.sync.runInboundSync()).toEqual({
      fromBridge: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
      removed: 0,
      flagged: 0,
    });

    // A later run on another instance: no per-product reads at all.
    firestore.reads.length = 0;
    bridgeReturns([
      { codigo: 'B20', descripcion: 'Breaker 20A', stock: 4, precio1: 10, precio2: 9 },
      { codigo: 'C12', descripcion: 'Cable 12', stock: 45, precio1: 2, precio2: 1.5 },
      { codigo: 'T1', descripcion: 'Toma doble', stock: 8, precio1: 3, precio2: 2.5 },
    ]);
    const second = instance(firestore);
    expect((await second.sync.runInboundSync()).unchanged).toBe(3);
    expect(secondStoreReads(firestore)).toHaveLength(0);

    const list = await instance(firestore).service.findAll();
    expect(list.map((row) => [row.name, row.stock])).toEqual([
      ['Breaker 20A', 4],
      ['Cable 12', 45],
      ['Toma doble', 8],
    ]);
    expect(list[0].linkedProduct).toMatchObject({ id: 'breaker-20a', stock: 7 });
    expect(secondStoreReads(firestore)).toHaveLength(0);
  });

  it('a manual edit shows up in the list served by another instance', async () => {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.SECOND_STORE_PRODUCTS, 'a', { name: 'Breaker 20A', stock: 4 });
    const admin = instance(firestore);
    await admin.service.findAll();

    await admin.service.update('a', { stock: 9, notes: 'contado a mano' } as never);
    const list = await instance(firestore).service.findAll();
    expect(list[0]).toMatchObject({ stock: 9, notes: 'contado a mano' });
  });
});

describe('matchBridgeProducts', () => {
  const record = (id: string, code: string | undefined, name: string, stock = 1, price = 1) =>
    ({ id, code, name, stock, retailPrice: price, wholesalePrice: price }) as SecondStoreProduct;
  const row = (codigo: string, descripcion: string, stock = 1, price = 1) => ({
    codigo,
    descripcion,
    stock,
    precio1: price,
    precio2: price,
  });

  it('gives rows sharing a code but not a description their own records', () => {
    const existing = [record('a', '16523', 'PILOTO VERDE'), record('b', '16523', 'PILOTO ROJO')];
    const matches = matchBridgeProducts(
      [row('16523', 'PILOTO ROJO', 5), row('16523', 'PILOTO VERDE', 9)],
      existing,
    );
    expect(matches.map((m) => m?.id)).toEqual(['b', 'a']);
  });

  it('keeps identical code+description rows on the same records whatever order they arrive in', () => {
    const existing = [record('a', 'X', 'PANEL 24W', 3, 10), record('b', 'X', 'PANEL 24W', 8, 12)];
    const rows = [row('X', 'PANEL 24W', 8, 12), row('X', 'PANEL 24W', 3, 10)];
    expect(matchBridgeProducts(rows, existing).map((m) => m?.id)).toEqual(['b', 'a']);
    expect(matchBridgeProducts([...rows].reverse(), existing).map((m) => m?.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('matches blank-code rows by description, one record each, and leaves extras as new', () => {
    const existing = [record('a', '', 'TOMA SENCILLA'), record('b', undefined, 'CABLE 12')];
    const matches = matchBridgeProducts(
      [row('', 'TOMA SENCILLA'), row('C12', 'Cable 12'), row('', 'TOMA SENCILLA')],
      existing,
    );
    expect(matches.map((m) => m?.id)).toEqual(['a', 'b', undefined]);
  });
});

describe('Second store sync with non-unique Profit Plus codes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('settles after one run: nothing is rewritten on the next', async () => {
    const firestore = new FakeFirestore();
    const rows = [
      { codigo: '16523', descripcion: 'PILOTO VERDE', stock: 2, precio1: 3, precio2: 2 },
      { codigo: '16523', descripcion: 'PILOTO ROJO', stock: 7, precio1: 3, precio2: 2 },
      { codigo: '', descripcion: 'TOMA SENCILLA', stock: 0, precio1: 2, precio2: 1.6 },
      { codigo: '', descripcion: 'TOMA DOBLE', stock: 4, precio1: 3, precio2: 2.4 },
    ];

    bridgeReturns(rows);
    expect(await instance(firestore).sync.runInboundSync()).toMatchObject({ created: 4 });

    bridgeReturns([...rows].reverse());
    expect(await instance(firestore).sync.runInboundSync()).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 4,
    });

    const list = await instance(firestore).service.findAll();
    expect(list.map((r) => [r.name, r.stock])).toEqual([
      ['PILOTO ROJO', 7],
      ['PILOTO VERDE', 2],
      ['TOMA DOBLE', 4],
      ['TOMA SENCILLA', 0],
    ]);
  });
});

describe('Second store sync and records removed in Profit Plus', () => {
  afterEach(() => jest.restoreAllMocks());

  const row = (codigo: string, descripcion: string) => ({
    codigo,
    descripcion,
    stock: 1,
    precio1: 2,
    precio2: 1,
  });

  function seeded(records: Record<string, Record<string, unknown>>) {
    const firestore = new FakeFirestore();
    for (const [id, data] of Object.entries(records)) {
      firestore.seed(Collections.SECOND_STORE_PRODUCTS, id, {
        stock: 1,
        retailPrice: 2,
        wholesalePrice: 1,
        ...data,
      });
    }
    return firestore;
  }

  it('deletes unlinked records Profit Plus stopped sending, flags linked ones, keeps manual ones', async () => {
    const firestore = seeded({
      keep: { name: 'Sigue', code: 'K1' },
      gone: { name: 'Borrado en Profit', code: 'G1' },
      linked: { name: 'Vinculado', code: 'L1', linkedProductId: 'p1' },
      manual: { name: 'Creado a mano', code: 'M1', source: 'manual' },
    });
    bridgeReturns([row('K1', 'Sigue')]);
    const result = await instance(firestore).sync.runInboundSync();
    expect(result).toMatchObject({ removed: 1, flagged: 1 });

    expect(firestore.read(Collections.SECOND_STORE_PRODUCTS, 'gone')).toBeUndefined();
    expect(
      firestore.read(Collections.SECOND_STORE_PRODUCTS, 'linked')?.missingFromErpSince,
    ).toBeInstanceOf(Date);
    expect(firestore.read(Collections.SECOND_STORE_PRODUCTS, 'manual')).toBeDefined();

    // The list another instance serves agrees.
    const names = (await instance(firestore).service.findAll()).map((r) => r.name);
    expect(names.sort()).toEqual(['Creado a mano', 'Sigue', 'Vinculado']);
  });

  it('clears the flag when the record comes back', async () => {
    const firestore = seeded({
      linked: {
        name: 'Vinculado',
        code: 'L1',
        linkedProductId: 'p1',
        missingFromErpSince: new Date('2026-10-01'),
      },
    });
    bridgeReturns([row('L1', 'Vinculado')]);
    expect(await instance(firestore).sync.runInboundSync()).toMatchObject({ updated: 1 });
    expect(firestore.read(Collections.SECOND_STORE_PRODUCTS, 'linked')).toMatchObject({
      missingFromErpSince: null,
    });
  });

  it('removes nothing when the bridge sends far fewer rows than usual', async () => {
    const records: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 20; i++) records[`r${i}`] = { name: `Artículo ${i}`, code: `C${i}` };
    const firestore = seeded(records);
    bridgeReturns([row('C0', 'Artículo 0')]);
    expect(await instance(firestore).sync.runInboundSync()).toMatchObject({
      removed: 0,
      flagged: 0,
    });
    expect(firestore.read(Collections.SECOND_STORE_PRODUCTS, 'r7')).toBeDefined();
  });

  it('marks records an admin creates as manual', async () => {
    const firestore = new FakeFirestore();
    const created = await instance(firestore).service.create({ name: 'Nuevo', stock: 2 } as never);
    expect(firestore.read(Collections.SECOND_STORE_PRODUCTS, created.id)).toMatchObject({
      source: 'manual',
    });
  });
});
