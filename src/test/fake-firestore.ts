/** Minimal in-memory stand-in for firebase-admin's Firestore, covering just
 * the surface FirestoreRepository and our services touch (collection/doc,
 * get/set/update, and runTransaction). Writes inside a transaction apply
 * immediately rather than batching until commit — fine for these tests
 * since nothing here reads its own writes before the transaction returns,
 * but it does NOT model Firestore's real optimistic-concurrency retries.
 * A concurrent-request race can only be verified against the real service
 * (or the emulator) — what this fake buys us is proving the guard re-reads
 * fresh state from inside the transaction instead of trusting a pre-fetched
 * value, which is the actual bug the fix in orders.service.ts addresses. */

type DocData = Record<string, unknown>;

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

  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data }));

    for (const clause of this.wheres) {
      docs = docs.filter((d) => matchesWhere(d.data[clause.field], clause.op, clause.value));
    }
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

  update(ref: FakeDocRef, data: DocData) {
    const existing = this.store.get(ref.path) ?? {};
    this.store.set(ref.path, { ...existing, ...data });
  }

  set(ref: FakeDocRef, data: DocData, opts?: { merge?: boolean }) {
    const existing = this.store.get(ref.path) ?? {};
    this.store.set(ref.path, opts?.merge ? { ...existing, ...data } : data);
  }
}

export class FakeFirestore {
  private readonly store = new Map<string, DocData>();

  collection(path: string) {
    return new FakeCollectionRef(path, this.store);
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return fn(new FakeTransaction(this.store));
  }

  /** Test setup helper — seeds a document directly, bypassing collection/doc. */
  seed(collectionPath: string, id: string, data: DocData) {
    this.store.set(`${collectionPath}/${id}`, data);
  }

  read(collectionPath: string, id: string) {
    return this.store.get(`${collectionPath}/${id}`);
  }
}
