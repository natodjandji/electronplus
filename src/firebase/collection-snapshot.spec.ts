import type { Firestore } from 'firebase-admin/firestore';
import { FakeFirestore } from '../test/fake-firestore';
import { CollectionSnapshot } from './collection-snapshot';
import type { FirestoreDoc } from './firestore.repository';

interface Item extends FirestoreDoc {
  name: string;
  stock: number;
  notes?: string;
}

const SOURCE = 'items';

function snapshotOn(firestore: FakeFirestore) {
  const fs = firestore as unknown as Firestore;
  return new CollectionSnapshot<Item>(fs, 'items', () => fs.collection(SOURCE));
}

function seedItems(firestore: FakeFirestore, count: number, nameLength = 12) {
  for (let i = 0; i < count; i++) {
    firestore.seed(SOURCE, `item-${i}`, {
      name: `n${i}`.padEnd(nameLength, 'x'),
      stock: i,
      createdAt: new Date(1_700_000_000_000 + i),
      updatedAt: new Date(1_700_000_000_000 + i),
    });
  }
}

function sourceReads(firestore: FakeFirestore) {
  return firestore.reads.filter((path) => path.startsWith(`${SOURCE}/`));
}

function shardDocs(firestore: FakeFirestore) {
  const shards: { id: string; data: string }[] = [];
  const meta = firestore.read('snapshots', 'items') as {
    generation: string;
    shardCount: number;
  };
  for (let i = 0; i < meta.shardCount; i++) {
    const doc = firestore.read('snapshots/items/shards', `${meta.generation}-${i}`) as {
      data: string;
    };
    shards.push({ id: `${meta.generation}-${i}`, data: doc.data });
  }
  return { meta, shards };
}

const byId = (items: Item[]) => new Map(items.map((item) => [item.id, item]));

describe('CollectionSnapshot', () => {
  it('builds from the source once, then costs one meta read per check', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 50);
    const snapshot = snapshotOn(firestore);

    const first = await snapshot.load({ maxAgeMs: 0 });
    expect(first).toHaveLength(50);
    expect(sourceReads(firestore)).toHaveLength(50);

    firestore.reads.length = 0;
    await snapshot.load({ maxAgeMs: 0 });
    expect(firestore.reads).toEqual(['snapshots/items']);

    // A second server instance reads the packed shards, never the source.
    firestore.reads.length = 0;
    const other = await snapshotOn(firestore).load({ maxAgeMs: 0 });
    expect(other).toHaveLength(50);
    expect(sourceReads(firestore)).toHaveLength(0);
    expect(firestore.reads.length).toBeLessThanOrEqual(1 + shardDocs(firestore).meta.shardCount);
  });

  it('serves from memory inside maxAgeMs without touching Firestore', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 5);
    const snapshot = snapshotOn(firestore);
    await snapshot.load({ maxAgeMs: 60_000 });

    firestore.reads.length = 0;
    await snapshot.load({ maxAgeMs: 60_000 });
    expect(firestore.reads).toHaveLength(0);
  });

  it('round-trips Dates as Dates', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 3);
    await snapshotOn(firestore).load({ maxAgeMs: 0 });

    const [item] = await snapshotOn(firestore).load({ maxAgeMs: 0 });
    expect(item.createdAt).toBeInstanceOf(Date);
  });

  it('applies put / merge / refresh / remove and other instances see them', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 10);
    const writer = snapshotOn(firestore);
    const reader = snapshotOn(firestore);
    await writer.load({ maxAgeMs: 0 });
    await reader.load({ maxAgeMs: 0 });

    // The source writes happen first, exactly like the services do.
    firestore.seed(SOURCE, 'new', { name: 'nuevo', stock: 1 });
    firestore.seed(SOURCE, 'item-2', { name: 'n2', stock: 99 });
    firestore.seed(SOURCE, 'item-3', { ...firestore.read(SOURCE, 'item-3'), stock: 7 });
    await writer.apply({
      put: [{ id: 'new', name: 'nuevo', stock: 1 } as Item],
      merge: [{ id: 'item-1', fields: { stock: 42 } }],
      refresh: ['item-3'],
      remove: ['item-4'],
    });

    const seen = byId(await reader.load({ maxAgeMs: 0 }));
    expect(seen.get('new')?.name).toBe('nuevo');
    expect(seen.get('item-1')?.stock).toBe(42);
    expect(seen.get('item-1')?.name).toBe('n1'.padEnd(12, 'x'));
    expect(seen.get('item-3')?.stock).toBe(7);
    expect(seen.has('item-4')).toBe(false);
    expect(seen.size).toBe(10);
  });

  it("a merge keeps another instance's concurrent edit to other fields", async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 3);
    const syncInstance = snapshotOn(firestore);
    const adminInstance = snapshotOn(firestore);
    await syncInstance.load({ maxAgeMs: 0 });
    await adminInstance.load({ maxAgeMs: 0 });

    await adminInstance.apply({
      put: [{ id: 'item-0', name: 'renamed', stock: 0, notes: 'nota' } as Item],
    });
    // syncInstance's cache still has the old item-0 — the merge must apply to
    // the current snapshot copy, not to that stale one.
    await syncInstance.apply({ merge: [{ id: 'item-0', fields: { stock: 5 } }] });

    const item = byId(await snapshotOn(firestore).load({ maxAgeMs: 0 })).get('item-0');
    expect(item).toMatchObject({ name: 'renamed', notes: 'nota', stock: 5 });
  });

  it('a refresh of a deleted doc drops it, and a merge for an unknown id re-reads it', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 3);
    const snapshot = snapshotOn(firestore);
    await snapshot.load({ maxAgeMs: 0 });

    await firestore.collection(SOURCE).doc('item-0').delete();
    firestore.seed(SOURCE, 'late', { name: 'tarde', stock: 3 });
    await snapshot.apply({ refresh: ['item-0'], merge: [{ id: 'late', fields: { stock: 4 } }] });

    const items = byId(await snapshotOn(firestore).load({ maxAgeMs: 0 }));
    expect(items.has('item-0')).toBe(false);
    expect(items.get('late')).toMatchObject({ name: 'tarde', stock: 3 });
  });

  it('spreads a large collection over shards that each fit in one document', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 4000, 300);
    const items = await snapshotOn(firestore).load({ maxAgeMs: 0 });
    expect(items).toHaveLength(4000);

    const { meta, shards } = shardDocs(firestore);
    expect(meta.shardCount).toBeGreaterThan(1);
    for (const shard of shards) {
      expect(Buffer.byteLength(shard.data, 'utf8')).toBeLessThan(900_000);
    }
  });

  it('re-partitions instead of failing when inserts outgrow a shard', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 1);
    const snapshot = snapshotOn(firestore);
    await snapshot.load({ maxAgeMs: 0 });
    expect(shardDocs(firestore).meta.shardCount).toBe(1);

    seedItems(firestore, 3000, 400);
    const put = (await firestore.collection(SOURCE).get()).docs.map(
      (doc) => ({ ...doc.data(), id: doc.id }) as Item,
    );
    await snapshot.apply({ put });

    const items = await snapshotOn(firestore).load({ maxAgeMs: 0 });
    expect(items).toHaveLength(3000);
    expect(shardDocs(firestore).meta.shardCount).toBeGreaterThan(1);
  });

  it('invalidate() makes the next read rebuild from the source and cleans old shards', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 20);
    const snapshot = snapshotOn(firestore);
    await snapshot.load({ maxAgeMs: 0 });
    const oldGeneration = shardDocs(firestore).meta.generation;

    await snapshot.invalidate();
    firestore.reads.length = 0;
    const items = await snapshotOn(firestore).load({ maxAgeMs: 0 });

    expect(items).toHaveLength(20);
    expect(sourceReads(firestore)).toHaveLength(20);
    const { meta } = shardDocs(firestore);
    expect(meta.generation).not.toBe(oldGeneration);
    expect(firestore.read('snapshots/items/shards', `${oldGeneration}-0`)).toBeUndefined();
  });

  it('rebuilds when the last rebuild is older than rebuildIfOlderThanMs', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 4);
    const snapshot = snapshotOn(firestore);
    await snapshot.load({ maxAgeMs: 0 });
    firestore.seed('snapshots', 'items', {
      ...firestore.read('snapshots', 'items'),
      rebuiltAtMs: Date.now() - 2 * 24 * 60 * 60 * 1000,
    });

    firestore.reads.length = 0;
    await snapshot.load({ maxAgeMs: 0, rebuildIfOlderThanMs: 24 * 60 * 60 * 1000 });
    expect(sourceReads(firestore)).toHaveLength(4);

    firestore.reads.length = 0;
    await snapshot.load({ maxAgeMs: 0, rebuildIfOlderThanMs: 24 * 60 * 60 * 1000 });
    expect(sourceReads(firestore)).toHaveLength(0);
  });

  it('apply() before any snapshot exists is a no-op, not a partial snapshot', async () => {
    const firestore = new FakeFirestore();
    seedItems(firestore, 2);
    await snapshotOn(firestore).apply({ put: [{ id: 'x', name: 'x', stock: 1 } as Item] });
    expect(firestore.read('snapshots', 'items')).toBeUndefined();
  });
});
