import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ProductsService } from '../products/products.service';
import { SecondStoreIndex } from './second-store-index';
import { SecondStoreService } from './second-store.service';
import { SecondStoreSyncService } from './second-store-sync.service';

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
