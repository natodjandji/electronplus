import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  CollectionReference,
  Firestore,
  Query,
  WhereFilterOp,
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export interface FirestoreDoc {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhereClause {
  field: string;
  op: WhereFilterOp;
  value: unknown;
}

export interface FindAllOptions {
  where?: WhereClause[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
  /** Page offset in document count — paired with `limit` for page 2+. Costs
   * a full scan of the skipped documents server-side, same as any
   * offset-based pagination; fine at this app's catalog scale, not meant
   * for deep pagination over large collections. */
  offset?: number;
}

/**
 * Thin, typed wrapper over a Firestore collection. Every module service
 * uses this instead of a TypeORM repository — keeps document<->DTO mapping
 * (id + createdAt/updatedAt) consistent instead of repeating it per module.
 */
export class FirestoreRepository<T extends FirestoreDoc> {
  constructor(
    private readonly firestore: Firestore,
    private readonly collectionPath: string,
  ) {}

  collection(): CollectionReference {
    return this.firestore.collection(this.collectionPath);
  }

  doc(id: string) {
    // A "/" in a doc ID makes Firestore treat it as a relative path, which
    // can resolve outside this collection entirely (e.g. into a
    // subcollection) — route params must never be trusted with this intact.
    if (id.includes('/')) {
      throw new BadRequestException('Invalid id');
    }
    return this.collection().doc(id);
  }

  /** Converts every top-level Firestore Timestamp field (createdAt/updatedAt
   * plus any doc-specific one like paidAt/issuedAt/verifiedAt) to a JS Date —
   * otherwise it round-trips as a raw {_seconds, _nanoseconds} object. */
  private fromSnapshot(snap: FirebaseFirestore.DocumentSnapshot): T {
    const data = snap.data()!;
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      converted[key] = (value as { toDate?: () => Date })?.toDate?.() ?? value;
    }
    return { ...converted, id: snap.id } as T;
  }

  async findById(id: string): Promise<T | null> {
    const snap = await this.doc(id).get();
    if (!snap.exists) return null;
    return this.fromSnapshot(snap);
  }

  /** Batched equivalent of calling findById for each id — one round trip via
   * the Admin SDK's getAll() instead of N separate document reads. Missing
   * ids are silently dropped rather than returned as null, since every
   * caller so far wants "the docs that exist" (e.g. resolving product line
   * items), not a positional array. Duplicate ids are only read once. */
  async findByIds(ids: string[]): Promise<T[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const snaps = await this.firestore.getAll(...uniqueIds.map((id) => this.doc(id)));
    return snaps.filter((snap) => snap.exists).map((snap) => this.fromSnapshot(snap));
  }

  async getOrThrow(id: string, notFoundMessage = 'Resource not found'): Promise<T> {
    const found = await this.findById(id);
    if (!found) throw new NotFoundException(notFoundMessage);
    return found;
  }

  /** Creates with an auto-generated id unless one is provided. */
  async create(data: Omit<Partial<T>, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<T> {
    const ref = id ? this.doc(id) : this.collection().doc();
    const now = FieldValue.serverTimestamp();
    await ref.set({ ...data, createdAt: now, updatedAt: now });
    return this.getOrThrow(ref.id);
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    await this.doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return this.getOrThrow(id);
  }

  async delete(id: string): Promise<void> {
    await this.doc(id).delete();
  }

  async findAll(options: FindAllOptions = {}): Promise<T[]> {
    let query: Query = this.collection();
    for (const clause of options.where ?? []) {
      query = query.where(clause.field, clause.op, clause.value);
    }
    if (options.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    const snap = await query.get();
    return snap.docs.map((d) => this.fromSnapshot(d));
  }

  async findOne(where: WhereClause[], orderBy?: FindAllOptions['orderBy']): Promise<T | null> {
    const results = await this.findAll({ where, orderBy, limit: 1 });
    return results[0] ?? null;
  }

  /** Total matching document count via Firestore's count() aggregation —
   * one small server-side count instead of fetching every matching doc just
   * to read `.length`, for callers (pagination) that need an accurate total
   * without the page of actual data. */
  async count(where: WhereClause[] = []): Promise<number> {
    let query: Query = this.collection();
    for (const clause of where) {
      query = query.where(clause.field, clause.op, clause.value);
    }
    const snap = await query.count().get();
    return snap.data().count;
  }
}
