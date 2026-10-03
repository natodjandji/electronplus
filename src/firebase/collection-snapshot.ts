import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { CollectionReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { Collections } from './firestore-collections';
import { FirestoreDoc, snapshotToEntity } from './firestore.repository';

/** How often a snapshot is rebuilt from its source collection, which also
 * heals any drift (a crash between a write and its apply(), an edit made
 * from the Firebase console, a seed script). Only enforced for callers that
 * opt in through LoadOptions.rebuildIfOlderThanMs. */
export const SNAPSHOT_REBUILD_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const SNAPSHOT_SHARDS_SUBCOLLECTION = 'shards';

/** Firestore caps a document at 1 MiB (field names and overhead included)
 * and one commit at 10 MiB. A rebuild aims well under the cap so later
 * inserts have room; a shard that would cross MAX_SHARD_BYTES triggers a
 * rebuild into more shards instead of a failed write. */
const TARGET_SHARD_BYTES = 350_000;
const MAX_SHARD_BYTES = 850_000;
/** Shards written per commit — keeps one commit near 7 MiB at worst. */
const MAX_SHARDS_PER_COMMIT = 8;
const READ_ATTEMPTS = 3;
const APPLY_ATTEMPTS = 3;
const REBUILD_ATTEMPTS = 3;

interface SnapshotMeta {
  generation: string;
  shardCount: number;
  shardVersions: string[];
  /** Bumped by every write — lets a rebuild notice a change that landed
   * while it was scanning the source collection. */
  seq: number;
  itemCount: number;
  rebuiltAtMs: number;
  /** Set by invalidate(): readers rebuild instead of trusting the shards. */
  invalid?: boolean;
}

interface ShardDoc {
  version: string;
  /** JSON array of items. One string field packs far tighter than a
   * Firestore array of maps, where every field name counts once per item. */
  data: string;
}

interface CacheEntry<T> {
  meta: SnapshotMeta;
  shards: T[][];
  items: T[];
  checkedAt: number;
}

export interface SnapshotChanges<T> {
  /** Complete, current items the caller already holds (just wrote or re-read). */
  put?: T[];
  /** Plain-value fields the caller just wrote to the source doc. Applied on
   * top of the item's current snapshot copy, so concurrent edits to other
   * fields survive; an id the snapshot doesn't have yet is re-read. */
  merge?: { id: string; fields: Partial<T> }[];
  /** Ids whose source docs changed in ways the caller doesn't hold in full
   * (e.g. a stock reservation) — re-read from the source collection. */
  refresh?: string[];
  /** Ids of source docs the caller just deleted. */
  remove?: string[];
}

export interface LoadOptions {
  /** How stale this instance's in-memory copy may be before re-checking the
   * meta doc (1 read, plus only the shards that changed). 0 = always check. */
  maxAgeMs: number;
  /** Rebuild from the source collection first when the last full rebuild is
   * older than this. Only for callers that can absorb a full scan's latency
   * once a day (admin screens, sync jobs) — public requests leave it unset. */
  rebuildIfOlderThanMs?: number;
}

type Op<T> =
  | { kind: 'put'; item: T }
  | { kind: 'merge'; fields: Partial<T> }
  | { kind: 'refresh' }
  | { kind: 'remove' };

type ChunkOutcome<T> =
  | { kind: 'written'; meta: SnapshotMeta; written: { index: number; items: T[] }[] }
  | { kind: 'replan' }
  | { kind: 'overflow' };

/**
 * A read-optimized copy of a whole collection, packed into a few large docs.
 *
 * Firestore bills one read per document, so listing an N-doc collection
 * costs N reads every time. Everything that needs the entire collection
 * (admin inventory lists, ERP sync matching, the public catalog) reads this
 * instead: one meta doc plus only the shards that changed since this
 * instance last looked — usually a single read.
 *
 * The source collection stays the source of truth. Every write path calls
 * apply() after its own write commits; the snapshot is rebuilt from the
 * source when it's missing, can't be patched, or is older than
 * SNAPSHOT_REBUILD_INTERVAL_MS (for opted-in callers).
 *
 * Layout under snapshots/{name}: the meta doc itself, plus
 * shards/{generation}-{index} holding the items whose id hashes to that
 * index — a single-item change rewrites one shard, not all of them. A
 * rebuild writes a new generation and switches the meta to it atomically,
 * so readers never see a half-written snapshot.
 */
export class CollectionSnapshot<T extends FirestoreDoc> {
  private readonly logger: Logger;
  private cache: CacheEntry<T> | null = null;
  private inflightRead: Promise<T[]> | null = null;
  private inflightRebuild: Promise<T[]> | null = null;
  /** Serializes this instance's writes so they don't contend with each
   * other on the meta doc (other instances are handled by transactions). */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly firestore: Firestore,
    private readonly name: string,
    private readonly source: () => CollectionReference,
  ) {
    this.logger = new Logger(`CollectionSnapshot:${name}`);
  }

  async load(options: LoadOptions): Promise<T[]> {
    const cached = this.cache;
    let items =
      cached && Date.now() - cached.checkedAt < options.maxAgeMs ? cached.items : await this.read();
    const rebuiltAtMs = this.cache?.meta.rebuiltAtMs ?? 0;
    if (
      options.rebuildIfOlderThanMs !== undefined &&
      Date.now() - rebuiltAtMs > options.rebuildIfOlderThanMs
    ) {
      items = await this.rebuild();
    }
    return items;
  }

  /** Applies changes the caller has already committed to the source
   * collection. Never rejects: a snapshot that can't be patched is dropped
   * instead, so the next read rebuilds it from the source rather than
   * serving a stale copy — the caller's own write must not fail over this. */
  async apply(changes: SnapshotChanges<T>): Promise<void> {
    const ops = collectOps(changes);
    if (ops.size === 0) return;
    const run = this.writeQueue.then(() => this.applyOps(ops));
    this.writeQueue = run.catch(() => undefined);
    try {
      await run;
    } catch (error) {
      this.logger.error(
        'Could not patch the snapshot — dropping it so the next read rebuilds from source',
        error as Error,
      );
      await this.invalidate();
    }
  }

  /** Forces the next read (on every instance) to rebuild from the source —
   * for a writer that can't tell exactly which of its writes landed. Marks
   * the meta rather than deleting it, so the rebuild still knows which old
   * shards to clean up; bumping seq makes a rebuild already scanning start
   * over instead of publishing a scan that may predate those writes. */
  async invalidate(): Promise<void> {
    this.cache = null;
    try {
      await this.firestore.runTransaction(async (tx) => {
        const current = await tx.get(this.metaRef());
        const seq = current.exists ? ((current.data() as SnapshotMeta).seq ?? 0) : 0;
        tx.set(this.metaRef(), { invalid: true, seq: seq + 1 }, { merge: true });
      });
    } catch (error) {
      this.logger.error('Could not drop the snapshot', error as Error);
    }
  }

  rebuild(): Promise<T[]> {
    this.inflightRebuild ??= this.rebuildFromSource().finally(() => {
      this.inflightRebuild = null;
    });
    return this.inflightRebuild;
  }

  private metaRef() {
    return this.firestore.collection(Collections.SNAPSHOTS).doc(this.name);
  }

  private shardRef(generation: string, index: number) {
    return this.metaRef().collection(SNAPSHOT_SHARDS_SUBCOLLECTION).doc(`${generation}-${index}`);
  }

  private read(): Promise<T[]> {
    this.inflightRead ??= this.readFromFirestore(true).finally(() => {
      this.inflightRead = null;
    });
    return this.inflightRead;
  }

  /** Returns null only when the snapshot is missing and `rebuildIfMissing`
   * is off (the rebuild path itself, which must not recurse into rebuild()). */
  private async readFromFirestore(rebuildIfMissing: true): Promise<T[]>;
  private async readFromFirestore(rebuildIfMissing: false): Promise<T[] | null>;
  private async readFromFirestore(rebuildIfMissing: boolean): Promise<T[] | null> {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const meta = usableMeta(await this.metaRef().get());
      if (!meta) return rebuildIfMissing ? this.rebuild() : null;

      const prev =
        this.cache &&
        this.cache.meta.generation === meta.generation &&
        this.cache.meta.shardCount === meta.shardCount
          ? this.cache
          : null;
      const stale = range(meta.shardCount).filter(
        (i) => !prev || prev.meta.shardVersions[i] !== meta.shardVersions[i],
      );
      if (prev && stale.length === 0) {
        prev.meta = copyMeta(meta);
        prev.checkedAt = Date.now();
        return prev.items;
      }

      const snaps = await this.firestore.getAll(
        ...stale.map((i) => this.shardRef(meta.generation, i)),
      );
      // Meta and shards are separate reads — a write that committed in
      // between shows up as a version mismatch. Retry against the newer meta.
      const consistent = snaps.every(
        (snap, k) =>
          snap.exists && (snap.data() as ShardDoc).version === meta.shardVersions[stale[k]],
      );
      if (!consistent) continue;

      const shards = prev ? [...prev.shards] : new Array<T[]>(meta.shardCount);
      snaps.forEach((snap, k) => {
        shards[stale[k]] = decodeItems<T>((snap.data() as ShardDoc).data);
      });
      return this.setCache(meta, shards).items;
    }
    throw new Error(`Snapshot "${this.name}" kept changing while being read`);
  }

  private async rebuildFromSource(): Promise<T[]> {
    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now();
      const before = await this.metaRef().get();
      const expectedSeq = before.exists ? ((before.data() as SnapshotMeta).seq ?? 0) : 0;

      const scan = await this.source().get();
      const items = scan.docs.map((doc) => snapshotToEntity<T>(doc));
      const shards = partition(items);
      const meta: SnapshotMeta = {
        generation: newVersion(),
        shardCount: shards.length,
        shardVersions: shards.map(() => newVersion()),
        seq: expectedSeq + 1,
        itemCount: items.length,
        rebuiltAtMs: Date.now(),
      };
      await this.writeShards(meta, shards);

      // Switch the meta to the new generation only if nothing was written
      // since the scan began — otherwise the scan may predate that write.
      // The last attempt switches regardless (the daily rebuild heals it)
      // so a steady stream of writes can't keep the snapshot missing.
      const force = attempt >= REBUILD_ATTEMPTS;
      const outcome = await this.firestore.runTransaction(async (tx) => {
        const current = await tx.get(this.metaRef());
        // Raw, not usableMeta(): an invalidated meta still names the old
        // generation whose shards need deleting.
        const currentMeta = current.exists ? (current.data() as Partial<SnapshotMeta>) : null;
        const currentSeq = currentMeta?.seq ?? 0;
        if (!force && currentSeq !== expectedSeq) {
          return { switched: false as const, currentMeta };
        }
        tx.set(this.metaRef(), { ...meta, seq: currentSeq + 1 });
        return { switched: true as const, previous: currentMeta };
      });

      if (!outcome.switched) {
        await this.deleteShards(meta.generation, meta.shardCount);
        // Another instance finished a rebuild while this one was scanning —
        // use that one instead of scanning the whole collection again.
        if (!outcome.currentMeta?.invalid && (outcome.currentMeta?.rebuiltAtMs ?? 0) >= startedAt) {
          const adopted = await this.readFromFirestore(false);
          if (adopted) return adopted;
        }
        continue;
      }

      const previous = outcome.previous;
      if (previous?.generation && previous.shardCount) {
        await this.deleteShards(previous.generation, previous.shardCount).catch((error: Error) =>
          this.logger.warn(`Could not delete old shards: ${error.message}`),
        );
      }
      this.logger.log(`Rebuilt from ${items.length} docs into ${shards.length} shard(s)`);
      return this.setCache(meta, shards).items;
    }
  }

  private async applyOps(ops: Map<string, Op<T>>): Promise<void> {
    for (let attempt = 0; attempt < APPLY_ATTEMPTS; attempt++) {
      const planned = usableMeta(await this.metaRef().get());
      // No usable snapshot: the next read rebuilds from the source, which
      // already holds these writes.
      if (!planned) return;

      const idsByShard = new Map<number, string[]>();
      for (const id of ops.keys()) {
        const index = shardOf(id, planned.shardCount);
        idsByShard.set(index, [...(idsByShard.get(index) ?? []), id]);
      }

      let replan = false;
      for (const chunk of chunked([...idsByShard.keys()], MAX_SHARDS_PER_COMMIT)) {
        const outcome = await this.firestore.runTransaction((tx) =>
          this.applyChunk(tx, planned, chunk, idsByShard, ops),
        );
        if (outcome.kind === 'overflow') {
          await this.rebuild();
          return;
        }
        if (outcome.kind === 'replan') {
          replan = true;
          break;
        }
        this.mergeIntoCache(outcome.meta, outcome.written);
      }
      // Every op is idempotent, so re-running chunks that already committed
      // before a replan is harmless.
      if (!replan) return;
    }
    throw new Error(`Snapshot "${this.name}" layout kept changing during apply`);
  }

  private async applyChunk(
    tx: Transaction,
    planned: SnapshotMeta,
    shardIndexes: number[],
    idsByShard: Map<number, string[]>,
    ops: Map<string, Op<T>>,
  ): Promise<ChunkOutcome<T>> {
    const meta = usableMeta(await tx.get(this.metaRef()));
    if (!meta || meta.generation !== planned.generation || meta.shardCount !== planned.shardCount) {
      return { kind: 'replan' };
    }

    const shardSnaps = await tx.getAll(
      ...shardIndexes.map((i) => this.shardRef(meta.generation, i)),
    );
    const shards = new Map<number, Map<string, T>>();
    shardSnaps.forEach((snap, k) => {
      const index = shardIndexes[k];
      const shard = snap.data() as ShardDoc | undefined;
      if (!shard || shard.version !== meta.shardVersions[index]) {
        throw new Error(`Shard ${index} of snapshot "${this.name}" is out of sync with its meta`);
      }
      shards.set(index, new Map(decodeItems<T>(shard.data).map((item) => [item.id, item])));
    });

    const ids = shardIndexes.flatMap((i) => idsByShard.get(i) ?? []);
    const needsSource = ids.filter((id) => {
      const op = ops.get(id)!;
      return (
        op.kind === 'refresh' ||
        (op.kind === 'merge' && !shards.get(shardOf(id, meta.shardCount))!.has(id))
      );
    });
    const sourceSnaps =
      needsSource.length > 0
        ? await tx.getAll(...needsSource.map((id) => this.source().doc(id)))
        : [];
    const fromSource = new Map<string, T | null>(
      sourceSnaps.map((snap, k) => [
        needsSource[k],
        snap.exists ? snapshotToEntity<T>(snap) : null,
      ]),
    );

    let itemDelta = 0;
    for (const id of ids) {
      const shard = shards.get(shardOf(id, meta.shardCount))!;
      const op = ops.get(id)!;
      let next: T | null;
      if (fromSource.has(id)) next = fromSource.get(id)!;
      else if (op.kind === 'put') next = op.item;
      else if (op.kind === 'merge') next = { ...shard.get(id)!, ...op.fields };
      else next = null;
      itemDelta += (next ? 1 : 0) - (shard.has(id) ? 1 : 0);
      if (next) shard.set(id, next);
      else shard.delete(id);
    }

    const shardVersions = [...meta.shardVersions];
    const written: { index: number; items: T[] }[] = [];
    for (const [index, shard] of shards) {
      const items = [...shard.values()];
      const data = encodeItems(items);
      if (Buffer.byteLength(data, 'utf8') > MAX_SHARD_BYTES) return { kind: 'overflow' };
      shardVersions[index] = newVersion();
      tx.set(this.shardRef(meta.generation, index), {
        version: shardVersions[index],
        data,
      } satisfies ShardDoc);
      written.push({ index, items });
    }
    const nextMeta: SnapshotMeta = {
      ...meta,
      shardVersions,
      seq: meta.seq + 1,
      itemCount: meta.itemCount + itemDelta,
    };
    tx.set(this.metaRef(), nextMeta);
    return { kind: 'written', meta: nextMeta, written };
  }

  /** Folds this instance's own committed write into its cache, so a caller
   * reading right after its write sees it without re-fetching shards. Shards
   * other writers changed keep their old cached version and get re-fetched
   * on the next read. */
  private mergeIntoCache(meta: SnapshotMeta, written: { index: number; items: T[] }[]): void {
    const cache = this.cache;
    if (
      !cache ||
      cache.meta.generation !== meta.generation ||
      cache.meta.shardCount !== meta.shardCount
    ) {
      return;
    }
    const shards = [...cache.shards];
    const shardVersions = [...cache.meta.shardVersions];
    for (const { index, items } of written) {
      shards[index] = items;
      shardVersions[index] = meta.shardVersions[index];
    }
    this.cache = {
      meta: { ...cache.meta, shardVersions, seq: meta.seq, itemCount: meta.itemCount },
      shards,
      items: shards.flat(),
      checkedAt: cache.checkedAt,
    };
  }

  private setCache(meta: SnapshotMeta, shards: T[][]): CacheEntry<T> {
    this.cache = { meta: copyMeta(meta), shards, items: shards.flat(), checkedAt: Date.now() };
    return this.cache;
  }

  private async writeShards(meta: SnapshotMeta, shards: T[][]): Promise<void> {
    for (const chunk of chunked(range(shards.length), MAX_SHARDS_PER_COMMIT)) {
      const batch = this.firestore.batch();
      for (const index of chunk) {
        batch.set(this.shardRef(meta.generation, index), {
          version: meta.shardVersions[index],
          data: encodeItems(shards[index]),
        } satisfies ShardDoc);
      }
      await batch.commit();
    }
  }

  private async deleteShards(generation: string, shardCount: number): Promise<void> {
    for (const chunk of chunked(range(shardCount), 400)) {
      const batch = this.firestore.batch();
      for (const index of chunk) batch.delete(this.shardRef(generation, index));
      await batch.commit();
    }
  }
}

/** One op per id. A merge on top of a put in the same call folds into it;
 * otherwise the later kind wins (put → merge → refresh → remove order). */
function collectOps<T extends FirestoreDoc>(changes: SnapshotChanges<T>): Map<string, Op<T>> {
  const ops = new Map<string, Op<T>>();
  for (const item of changes.put ?? []) ops.set(item.id, { kind: 'put', item });
  for (const { id, fields } of changes.merge ?? []) {
    const existing = ops.get(id);
    if (existing?.kind === 'put')
      ops.set(id, { kind: 'put', item: { ...existing.item, ...fields } });
    else if (existing?.kind === 'merge') {
      ops.set(id, { kind: 'merge', fields: { ...existing.fields, ...fields } });
    } else ops.set(id, { kind: 'merge', fields });
  }
  for (const id of changes.refresh ?? []) ops.set(id, { kind: 'refresh' });
  for (const id of changes.remove ?? []) ops.set(id, { kind: 'remove' });
  return ops;
}

/** Spreads items over as few shards as fit — more when the id hash happens
 * to pile too many into one. */
function partition<T extends FirestoreDoc>(items: T[]): T[][] {
  const totalBytes = Buffer.byteLength(encodeItems(items), 'utf8');
  let shardCount = Math.max(1, Math.ceil(totalBytes / TARGET_SHARD_BYTES));
  for (;;) {
    const shards = range(shardCount).map(() => [] as T[]);
    for (const item of items) shards[shardOf(item.id, shardCount)].push(item);
    const fits = shards.every(
      (shard) => Buffer.byteLength(encodeItems(shard), 'utf8') <= MAX_SHARD_BYTES,
    );
    if (fits) return shards;
    if (shardCount > items.length) {
      throw new Error('A single item is larger than a snapshot shard can hold');
    }
    shardCount = Math.ceil(shardCount * 1.5) + 1;
  }
}

/** FNV-1a — stable, cheap, and spreads short string ids evenly. */
export function shardOf(id: string, shardCount: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % shardCount;
}

/** JSON with Dates preserved as Dates (plain JSON would hand them back as
 * strings, unlike every other read path's entities). */
function encodeItems<T>(items: T[]): string {
  return JSON.stringify(items, function (this: Record<string, unknown>, key, value: unknown) {
    const raw = this[key];
    return raw instanceof Date ? { $date: raw.getTime() } : value;
  });
}

function decodeItems<T>(data: string): T[] {
  return JSON.parse(data, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object') {
      const tagged = value as { $date?: unknown };
      if (typeof tagged.$date === 'number' && Object.keys(value).length === 1) {
        return new Date(tagged.$date);
      }
    }
    return value;
  }) as T[];
}

/** The meta, or null when the snapshot is missing or was invalidated. */
function usableMeta(snap: FirebaseFirestore.DocumentSnapshot): SnapshotMeta | null {
  if (!snap.exists) return null;
  const meta = snap.data() as SnapshotMeta;
  return meta.invalid || !meta.generation ? null : meta;
}

function copyMeta(meta: SnapshotMeta): SnapshotMeta {
  return { ...meta, shardVersions: [...meta.shardVersions] };
}

function newVersion(): string {
  return randomBytes(6).toString('base64url');
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}
