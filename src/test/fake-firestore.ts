/** Minimal in-memory stand-in for firebase-admin's Firestore, covering just
 * the surface FirestoreRepository and our services touch (collection/doc,
 * get/set/update/create/delete, getAll, batch, bulkWriter and
 * runTransaction). Writes inside a transaction apply
 * immediately rather than batching until commit — fine for these tests
 * since nothing here reads its own writes before the transaction returns,
 * but it does NOT model Firestore's real optimistic-concurrency retries.
 * A concurrent-request race can only be verified against the real service
 * (or the emulator) — what this fake buys us is proving the guard re-reads
 * fresh state from inside the transaction instead of trusting a pre-fetched
 * value, which is the actual bug the fix in orders.service.ts addresses. */

type DocData = Record<string, unknown>;

const readLogs = new WeakMap<Map<string, DocData>, string[]>();

export class FakeDocRef {
  constructor(
    public readonly path: string,
    public readonly id: string,
    private readonly store: Map<string, DocData>,
  ) {}

  async get() {
    return this.readSnap();
  }

  private readSnap() {
    readLogs.get(this.store)?.push(this.path);
    const data = this.store.get(this.path);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => data,
    };
  }

  async set(data: DocData, opts?: { merge?: boolean }) {
    const existing = this.store.get(this.path) ?? {};
    this.store.set(this.path, opts?.merge ? { ...existing, ...data } : data);
  }

  /** Mirrors the real SDK: rejects with gRPC code 6 (ALREADY_EXISTS) instead
   * of overwriting. Synchronous check-and-write, so unlike the real service
   * it can't model two truly simultaneous creates — but it does prove the
   * caller handles the rejection instead of assuming success. */
  async create(data: DocData) {
    if (this.store.has(this.path)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.store.set(this.path, data);
  }

  /** Mirrors the real SDK: rejects with gRPC code 5 (NOT_FOUND) instead of
   * creating the doc. */
  async update(data: DocData) {
    const existing = this.store.get(this.path);
    if (existing === undefined) {
      throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
    }
    this.store.set(this.path, { ...existing, ...data });
  }

  async delete() {
    this.store.delete(this.path);
  }

  collection(sub: string) {
    return new FakeCollectionRef(`${this.path}/${sub}`, this.store);
  }
}

type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';

interface WhereClause {
  field: string;
  op: WhereOp;
  value: unknown;
}

/** Query is intentionally lazy (matches real Firestore) — where/orderBy/limit
 * just accumulate clauses, and only get() actually scans the store. */
class FakeQuery {
  constructor(
    protected readonly path: string,
    protected readonly store: Map<string, DocData>,
    protected readonly wheres: WhereClause[] = [],
    protected readonly order?: { field: string; direction: 'asc' | 'desc' },
    protected readonly limitCount?: number,
  ) {}

  where(field: string, op: WhereOp, value: unknown) {
    return new FakeQuery(
      this.path,
      this.store,
      [...this.wheres, { field, op, value }],
      this.order,
      this.limitCount,
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.path, this.store, this.wheres, { field, direction }, this.limitCount);
  }

  limit(count: number) {
    return new FakeQuery(this.path, this.store, this.wheres, this.order, count);
  }

  /** Like the real aggregation: counts matches without reading (or logging) them. */
  count() {
    return {
      get: async () => ({ data: () => ({ count: this.matching().length }) }),
    };
  }

  private matching() {
    const prefix = `${this.path}/`;
    let docs = [...this.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data }));

    for (const clause of this.wheres) {
      docs = docs.filter((d) => matchesWhere(d.data[clause.field], clause.op, clause.value));
    }
    return docs;
  }

  async get() {
    let docs = this.matching();
    if (this.order) {
      const { field, direction } = this.order;
      docs = [...docs].sort((a, b) => {
        const av = a.data[field] as never;
        const bv = b.data[field] as never;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return direction === 'desc' ? -cmp : cmp;
      });
    }
    if (this.limitCount !== undefined) {
      docs = docs.slice(0, this.limitCount);
    }
    readLogs.get(this.store)?.push(...docs.map((d) => `${this.path}/${d.id}`));

    return {
      docs: docs.map((d) => ({
        id: d.id,
        exists: true,
        data: () => d.data,
      })),
    };
  }
}

function matchesWhere(actual: unknown, op: WhereOp, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '<':
      return (actual as never) < (expected as never);
    case '<=':
      return (actual as never) <= (expected as never);
    case '>':
      return (actual as never) > (expected as never);
    case '>=':
      return (actual as never) >= (expected as never);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
}

export class FakeCollectionRef extends FakeQuery {
  private counter = 0;

  doc(id?: string) {
    const docId = id ?? `auto_${this.counter++}`;
    return new FakeDocRef(`${this.path}/${docId}`, docId, this.store);
  }
}

class FakeTransaction {
  constructor(private readonly store: Map<string, DocData>) {}

  async get(ref: FakeDocRef) {
    return ref.get();
  }

  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  update(ref: FakeDocRef, data: DocData) {
    const existing = this.store.get(ref.path) ?? {};
    this.store.set(ref.path, { ...existing, ...data });
  }

  set(ref: FakeDocRef, data: DocData, opts?: { merge?: boolean }) {
    const existing = this.store.get(ref.path) ?? {};
    this.store.set(ref.path, opts?.merge ? { ...existing, ...data } : data);
  }

  delete(ref: FakeDocRef) {
    this.store.delete(ref.path);
  }
}

class FakeWriteBatch {
  private readonly ops: (() => Promise<void>)[] = [];

  set(ref: FakeDocRef, data: DocData, opts?: { merge?: boolean }) {
    this.ops.push(() => ref.set(data, opts));
    return this;
  }

  delete(ref: FakeDocRef) {
    this.ops.push(() => ref.delete());
    return this;
  }

  async commit() {
    for (const op of this.ops) await op();
  }
}

export class FakeFirestore {
  private readonly store = new Map<string, DocData>();
  /** Path of every document read — lets tests assert what a code path costs
   * (Firestore bills per document read). A query counts one read per
   * returned document, same as the real service. */
  readonly reads: string[] = [];

  constructor() {
    readLogs.set(this.store, this.reads);
  }

  collection(path: string) {
    return new FakeCollectionRef(path, this.store);
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return fn(new FakeTransaction(this.store));
  }

  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  batch() {
    return new FakeWriteBatch();
  }

  /** Queues like the real BulkWriter; close() flushes. */
  bulkWriter() {
    const batch = new FakeWriteBatch();
    return {
      set: (ref: FakeDocRef, data: DocData, opts?: { merge?: boolean }) => {
        batch.set(ref, data, opts);
        return Promise.resolve();
      },
      close: () => batch.commit(),
    };
  }

  /** Test setup helper — seeds a document directly, bypassing collection/doc. */
  seed(collectionPath: string, id: string, data: DocData) {
    this.store.set(`${collectionPath}/${id}`, data);
  }

  read(collectionPath: string, id: string) {
    return this.store.get(`${collectionPath}/${id}`);
  }
}
