import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import {
  CollectionSnapshot,
  LoadOptions,
  SNAPSHOT_REBUILD_INTERVAL_MS,
  SnapshotChanges,
} from '../../firebase/collection-snapshot';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slug';
import { OrderStatus } from '../orders/entities/order.entity';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { AdminQueryProductsDto } from './dto/admin-query-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { StockLevel } from './entities/stock-level.entity';
import { Warehouse } from './entities/warehouse.entity';

const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.FULFILLED,
];

export const STOCK_CHANGED_EVENT = 'stock.changed';

export interface StockChangedEvent {
  productId: string;
  sku: string;
  name: string;
  stock: number;
  minStockThreshold?: number;
}

/** What one ERP sync run wrote, for a single applyCatalogChanges() call. */
export type ErpCatalogChanges = Required<
  Pick<SnapshotChanges<Product>, 'put' | 'merge' | 'remove'>
>;

export interface StockUpdateContext {
  productId: string;
  productRef: DocumentReference;
  levelRef?: DocumentReference;
  currentStock: number;
  currentLevelQty: number;
  levelExists: boolean;
  warehouseInfo?: { id: string; code: string; name: string };
  sku: string;
  name: string;
  minStockThreshold?: number;
}

/** gRPC status code Firestore returns when update() targets a missing doc. */
const GRPC_NOT_FOUND = 5;

function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

/** `GET products/<segment>` routes declared before `products/:id` in
 * ProductsController — a product slugified to one of these would be
 * unreachable (the static route wins). Keep in sync with that controller. */
const RESERVED_PRODUCT_IDS = new Set(['admin', 'best-sellers', 'catalog']);

const PRODUCT_ID_MAX_LENGTH = 80;

/** Name -> id stem. Re-trims after the cut so truncating mid-name never
 * leaves a dangling hyphen; falls back for names with no usable characters. */
function productIdBase(name: string): string {
  return slugify(name).slice(0, PRODUCT_ID_MAX_LENGTH).replace(/-+$/, '') || 'producto';
}

const TOP_SELLING_DEFAULT_LIMIT = 8;
// Caps `limit`, which arrives straight off an unauthenticated query string
// — see topSelling()'s doc comment.
const TOP_SELLING_MAX_LIMIT = 24;

/** How stale one server instance's copy of the public catalog may get
 * relative to writes made on another instance (an instance always sees its
 * own writes at once). Bounds the public catalog's Firestore cost to about
 * one read per instance per window, however many visitors there are —
 * listing and searching used to read every product on every request. */
const PUBLIC_CATALOG_MAX_AGE_MS = 60 * 1000;
/** Admin screens and the ERP sync always re-check (one read) and keep the
 * snapshot rebuilt daily — see CollectionSnapshot. */
const OPS_CATALOG_LOAD: LoadOptions = {
  maxAgeMs: 0,
  rebuildIfOlderThanMs: SNAPSHOT_REBUILD_INTERVAL_MS,
};

/** Best-seller ranking, shared by every instance at snapshots/bestSellers.
 * Recomputing it scans up to 90 days of orders, so it happens at most every
 * few hours overall — it used to run per instance every 15 minutes. */
const BEST_SELLERS_DOC_ID = 'bestSellers';
const BEST_SELLERS_RECOMPUTE_MS = 6 * 60 * 60 * 1000;
const BEST_SELLERS_CHECK_MS = 15 * 60 * 1000;
/** Ranked ids kept — the largest page allowed, with room for products that
 * turn out inactive or deleted. */
const BEST_SELLERS_RANKING_SIZE = TOP_SELLING_MAX_LIMIT * 3;

const nameCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

interface CatalogViews {
  source: Product[];
  /** Every product, by name. */
  all: Product[];
  /** Active products only, by name — what customers can see. */
  active: Product[];
  byId: Map<string, Product>;
}

@Injectable()
export class ProductsService {
  private readonly repo: FirestoreRepository<Product>;
  private readonly categoriesRepo: FirestoreRepository<Category>;
  private readonly warehousesRepo: FirestoreRepository<Warehouse>;
  /** Every product packed into a few docs — see CollectionSnapshot. Backs
   * every whole-catalog read: public listing and search, admin lists, ERP
   * matching, best-seller resolution. */
  private readonly catalog: CollectionSnapshot<Product>;
  private catalogViews: CatalogViews | null = null;
  private bestSellers: { ids: string[]; checkedAt: number } | null = null;
  private bestSellersInflight: Promise<string[]> | null = null;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Product>(firestore, Collections.PRODUCTS);
    this.categoriesRepo = new FirestoreRepository<Category>(firestore, Collections.CATEGORIES);
    this.warehousesRepo = new FirestoreRepository<Warehouse>(firestore, Collections.WAREHOUSES);
    this.catalog = new CollectionSnapshot<Product>(firestore, Collections.PRODUCTS, () =>
      this.repo.collection(),
    );
  }

  /** Public listing — filtered, searched and paged in memory over the
   * catalog snapshot (Firestore has no full-text search anyway). */
  async findAll(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const skip = (page - 1) * limit;

    let products = await this.activeCatalog();
    if (query.category) {
      products = products.filter((p) => p.category?.code === query.category);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      products = products.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
    }
    return new PaginatedResult(products.slice(skip, skip + limit), products.length, page, limit);
  }

  /** Every active product, by name — the storefront's whole catalog. */
  async activeCatalog(): Promise<Product[]> {
    return this.viewsOf(await this.catalog.load({ maxAgeMs: PUBLIC_CATALOG_MAX_AGE_MS })).active;
  }

  /** Public product page. Served from the snapshot; falls back to the doc
   * itself for a product created on another instance within the window. */
  async findPublicById(id: string): Promise<Product> {
    const views = this.viewsOf(await this.catalog.load({ maxAgeMs: PUBLIC_CATALOG_MAX_AGE_MS }));
    return views.byId.get(id) ?? this.findById(id);
  }

  /** Every product (active or not) by id, current as of this call — for ops
   * screens that resolve links to many products at once. */
  async catalogLookup(): Promise<Map<string, Product>> {
    return this.viewsOf(await this.catalog.load(OPS_CATALOG_LOAD)).byId;
  }

  /** Sorting and indexing thousands of products is redone only when the
   * snapshot actually changed, not on every request. */
  private viewsOf(items: Product[]): CatalogViews {
    if (this.catalogViews?.source !== items) {
      const all = [...items].sort((a, b) => nameCollator.compare(a.name, b.name));
      this.catalogViews = {
        source: items,
        all,
        active: all.filter((p) => p.active),
        byId: new Map(items.map((p) => [p.id, p])),
      };
    }
    return this.catalogViews;
  }

  /** For bulk writers (ERP sync) that report every change once at the end. */
  applyCatalogChanges(changes: SnapshotChanges<Product>): Promise<void> {
    return this.catalog.apply(changes);
  }

  /** After a committed stock change: notifies listeners (low-stock alerts,
   * the ops socket) and brings the catalog snapshot up to date. Re-reads the
   * product docs rather than trusting each event's number, so two orders
   * committing close together can't leave the older stock in the snapshot. */
  async stockCommitted(changes: StockChangedEvent[]): Promise<void> {
    for (const change of changes) this.events.emit(STOCK_CHANGED_EVENT, change);
    await this.catalog.apply({ refresh: changes.map((c) => c.productId) });
  }

  findById(id: string): Promise<Product> {
    return this.repo.getOrThrow(id, 'Product not found');
  }

  findByIds(ids: string[]): Promise<Product[]> {
    return this.repo.findByIds(ids);
  }

  /** Best-selling active products by units sold across paid/fulfilled orders in the last 90
   * days — falls back to filling remaining slots with other active products so a fresh store
   * never looks sparse. Backs the public, unauthenticated /products/best-sellers endpoint hit
   * on every storefront visit, so both halves are cheap: the ranking is shared and recomputed
   * at most every BEST_SELLERS_RECOMPUTE_MS (see bestSellerRanking), and the products
   * themselves come from the catalog snapshot.
   *
   * `limit` arrives straight off an unauthenticated query string, so it's clamped to
   * 1..TOP_SELLING_MAX_LIMIT — non-numeric input would otherwise make slice(0, NaN) silently
   * return an empty list. */
  async topSelling(limitInput = TOP_SELLING_DEFAULT_LIMIT): Promise<Product[]> {
    const limit = Number.isFinite(limitInput)
      ? Math.min(Math.max(Math.trunc(limitInput), 1), TOP_SELLING_MAX_LIMIT)
      : TOP_SELLING_DEFAULT_LIMIT;

    const [rankedIds, items] = await Promise.all([
      this.bestSellerRanking(),
      this.catalog.load({ maxAgeMs: PUBLIC_CATALOG_MAX_AGE_MS }),
    ]);
    const views = this.viewsOf(items);
    const ranked = rankedIds
      .map((id) => views.byId.get(id))
      .filter((p): p is Product => Boolean(p?.active))
      .slice(0, limit);

    const seen = new Set(ranked.map((p) => p.id));
    for (const product of views.active) {
      if (ranked.length >= limit) break;
      if (!seen.has(product.id)) ranked.push(product);
    }
    return ranked;
  }

  /** Product ids by units sold, best first. Cached per instance for
   * BEST_SELLERS_CHECK_MS (then 1 read), and the stored ranking is
   * recomputed only once it's older than BEST_SELLERS_RECOMPUTE_MS. */
  private bestSellerRanking(): Promise<string[]> {
    const cached = this.bestSellers;
    if (cached && Date.now() - cached.checkedAt < BEST_SELLERS_CHECK_MS) {
      return Promise.resolve(cached.ids);
    }
    this.bestSellersInflight ??= this.loadBestSellerRanking().finally(() => {
      this.bestSellersInflight = null;
    });
    return this.bestSellersInflight;
  }

  private async loadBestSellerRanking(): Promise<string[]> {
    const ref = this.firestore.collection(Collections.SNAPSHOTS).doc(BEST_SELLERS_DOC_ID);
    const snap = await ref.get();
    const stored = snap.exists
      ? (snap.data() as { productIds: string[]; computedAtMs: number })
      : null;

    let ids = stored?.productIds ?? [];
    if (!stored || Date.now() - stored.computedAtMs > BEST_SELLERS_RECOMPUTE_MS) {
      ids = await this.computeBestSellerRanking();
      await ref.set({ productIds: ids, computedAtMs: Date.now() });
    }
    this.bestSellers = { ids, checkedAt: Date.now() };
    return ids;
  }

  /** Bounded to a recent window rather than the full order history — an
   * unbounded scan would grow more expensive with every order ever placed. */
  private async computeBestSellerRanking(): Promise<string[]> {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const ordersSnap = await this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(since))
      .get();

    const unitsSold = new Map<string, number>();
    for (const doc of ordersSnap.docs) {
      const items = (doc.data().items ?? []) as { productId: string; qty: number }[];
      for (const item of items) {
        unitsSold.set(item.productId, (unitsSold.get(item.productId) ?? 0) + item.qty);
      }
    }

    return [...unitsSold.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([productId]) => productId)
      .slice(0, BEST_SELLERS_RANKING_SIZE);
  }

  /** Full-fidelity listing for the admin inventory panel — includes inactive
   * products and cost/supplier fields. Served from the catalog snapshot (one
   * read when nothing changed) and filtered in memory. */
  async adminFindAll(query: AdminQueryProductsDto): Promise<Product[]> {
    let products = this.viewsOf(await this.catalog.load(OPS_CATALOG_LOAD)).all;

    if (query.supplierId) products = products.filter((p) => p.supplierId === query.supplierId);
    if (query.categoryId) products = products.filter((p) => p.categoryId === query.categoryId);
    if (query.search) {
      const needle = query.search.toLowerCase();
      products = products.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
    }
    if (query.lowStockOnly === 'true') {
      products = products.filter(
        (p) => (p.minStockThreshold ?? 0) > 0 && p.stock <= p.minStockThreshold!,
      );
    }

    return products;
  }

  async findByQrToken(token: string): Promise<Product> {
    const product = await this.repo.findOne([{ field: 'qrToken', op: '==', value: token }]);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async stockByWarehouse(productId: string): Promise<StockLevel[]> {
    const productRef = this.repo.doc(productId); // throws if productId isn't a valid single-segment id
    const levelsRepo = new FirestoreRepository<StockLevel>(
      this.firestore,
      `${productRef.path}/${Collections.STOCK_LEVELS}`,
    );
    return levelsRepo.findAll();
  }

  async stockInWarehouse(warehouseId: string): Promise<StockLevel[]> {
    const snap = await this.firestore
      .collectionGroup(Collections.STOCK_LEVELS)
      .where('warehouseId', '==', warehouseId)
      .get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
      } as StockLevel;
    });
  }

  /** Inserts a product under an id slugified from its name — that id is also
   * its public URL (/product/{id}) and is embedded in printed QR labels, so
   * it must never change afterwards (a later name edit leaves it alone).
   * Collisions get -2/-3/... Uses an atomic create instead of
   * check-then-write: ERP sync upserts products concurrently
   * (Promise.allSettled), and two items sharing a name would otherwise both
   * pass an existence check and the second set() would silently overwrite
   * the first product. */
  private async createWithSlugId(
    name: string,
    data: Omit<Partial<Product>, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Product> {
    const base = productIdBase(name);
    for (let suffix = 1; ; suffix++) {
      const id = suffix === 1 ? base : `${base}-${suffix}`;
      if (RESERVED_PRODUCT_IDS.has(id)) continue;
      const created = await this.repo.createIfAbsent(data, id);
      if (created) return created;
    }
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const category = await this.categoriesRepo.getOrThrow(dto.categoryId, 'Category not found');
    const product = await this.createWithSlugId(dto.name, {
      sku: dto.sku,
      name: dto.name,
      specs: dto.specs,
      categoryId: category.id,
      category: { id: category.id, code: category.code, label: category.label },
      supplierId: dto.supplierId,
      retailPrice: dto.retailPrice,
      wholesalePrice: dto.wholesalePrice,
      cost: dto.cost,
      stock: 0,
      minStockThreshold: dto.minStockThreshold,
      imageUrl: dto.imageUrl,
      thumbnailUrl: dto.thumbnailUrl,
      active: dto.active ?? true,
      qrToken: generateQrToken(),
    });
    await this.catalog.apply({ put: [product] });
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    // The repository's update is a set-merge: on an unknown id it would
    // create a half-formed product (no sku/qrToken) and index it.
    await this.repo.getOrThrow(id, 'Product not found');
    const patch: Partial<Product> = { ...dto };
    if (dto.categoryId) {
      const category = await this.categoriesRepo.getOrThrow(dto.categoryId, 'Category not found');
      patch.category = { id: category.id, code: category.code, label: category.label };
    }
    const updated = await this.repo.update(id, patch);
    await this.catalog.apply({ put: [updated] });
    return updated;
  }

  /** Hard delete — quotes/orders/purchase orders already snapshot sku/name/
   * price into their own line items at the time a product is added, so
   * they don't need the product doc to still exist. Second-store links
   * already handle a since-deleted product gracefully (surfaced as
   * unlinked, see SecondStoreService.findAll/findById). */
  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Product not found');
    const stockLevels = await this.firestore.collection(`products/${id}/stockLevels`).get();
    if (!stockLevels.empty) {
      const batch = this.firestore.batch();
      for (const doc of stockLevels.docs) batch.delete(doc.ref);
      await batch.commit();
    }
    await this.repo.delete(id);
    await this.catalog.apply({ remove: [id] });
  }

  /** Manual admin stock adjustment (+ restock / - shrinkage), optionally scoped to a warehouse. */
  async adjustStock(id: string, dto: AdjustStockDto): Promise<Product> {
    const changed = await this.firestore.runTransaction(async (tx) => {
      const ctx = await this.getStockForUpdate(tx, id, dto.warehouseId);
      return this.applyStockDelta(tx, ctx, dto.delta);
    });

    await this.stockCommitted([changed]);
    return this.findById(id);
  }

  // --- Transaction-safe split of adjustStock (read phase / write phase) for
  // callers (e.g. PurchaseOrdersService) that need the stock change to commit
  // atomically alongside other writes of their own, in a single transaction.
  // Firestore requires every read in a transaction before any write, so —
  // same as getForUpdate/reserveStock below — call getStockForUpdate for
  // every item first, then applyStockDelta for every item.

  async getStockForUpdate(
    tx: Transaction,
    id: string,
    warehouseId?: string,
  ): Promise<StockUpdateContext> {
    const productRef = this.repo.doc(id);
    const levelRef = warehouseId
      ? productRef.collection(Collections.STOCK_LEVELS).doc(warehouseId)
      : undefined;

    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throw new NotFoundException('Product not found');
    const levelSnap = levelRef ? await tx.get(levelRef) : undefined;
    const warehouseSnap =
      levelRef && !levelSnap?.exists
        ? await tx.get(this.warehousesRepo.doc(warehouseId!))
        : undefined;

    const data = productSnap.data()!;
    return {
      productId: id,
      productRef,
      levelRef,
      currentStock: data.stock as number,
      currentLevelQty: levelSnap?.exists ? (levelSnap.data()!.quantity as number) : 0,
      levelExists: Boolean(levelSnap?.exists),
      warehouseInfo:
        warehouseSnap?.exists && warehouseId
          ? { id: warehouseId, code: warehouseSnap.data()!.code, name: warehouseSnap.data()!.name }
          : undefined,
      sku: data.sku as string,
      name: data.name as string,
      minStockThreshold: data.minStockThreshold as number | undefined,
    };
  }

  /** Batched equivalent of calling getStockForUpdate per item — one
   * tx.getAll() instead of N sequential tx.get() round trips. Only for
   * callers that never pass a warehouseId (Orders' compensate/cancel). */
  async getStockForUpdateMany(
    tx: Transaction,
    productIds: string[],
  ): Promise<Map<string, StockUpdateContext>> {
    const refs = productIds.map((id) => this.repo.doc(id));
    const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
    const result = new Map<string, StockUpdateContext>();
    snaps.forEach((snap, idx) => {
      if (!snap.exists) throw new NotFoundException('Product not found');
      const data = snap.data()!;
      result.set(productIds[idx], {
        productId: productIds[idx],
        productRef: refs[idx],
        levelRef: undefined,
        currentStock: data.stock as number,
        currentLevelQty: 0,
        levelExists: false,
        warehouseInfo: undefined,
        sku: data.sku as string,
        name: data.name as string,
        minStockThreshold: data.minStockThreshold as number | undefined,
      });
    });
    return result;
  }

  /** Batched equivalent for callers where every item shares the same
   * warehouse (PurchaseOrdersService's stock-in on settlement — one PO, one
   * warehouseId, N line items). One tx.getAll() for the product docs, one
   * for the per-product stock-level docs, and at most a single extra read
   * for the warehouse doc — the old per-item getStockForUpdate() call
   * re-fetched that same warehouse doc again for every item whose level
   * didn't exist yet, instead of once for the whole batch. */
  async getStockForUpdateManyForWarehouse(
    tx: Transaction,
    productIds: string[],
    warehouseId: string,
  ): Promise<Map<string, StockUpdateContext>> {
    const productRefs = productIds.map((id) => this.repo.doc(id));
    const levelRefs = productRefs.map((ref) =>
      ref.collection(Collections.STOCK_LEVELS).doc(warehouseId),
    );

    const productSnaps = productRefs.length > 0 ? await tx.getAll(...productRefs) : [];
    const levelSnaps = levelRefs.length > 0 ? await tx.getAll(...levelRefs) : [];

    const needsWarehouseDoc = levelSnaps.some((snap) => !snap.exists);
    const warehouseSnap = needsWarehouseDoc
      ? await tx.get(this.warehousesRepo.doc(warehouseId))
      : undefined;
    const warehouseInfo = warehouseSnap?.exists
      ? { id: warehouseId, code: warehouseSnap.data()!.code, name: warehouseSnap.data()!.name }
      : undefined;

    const result = new Map<string, StockUpdateContext>();
    productIds.forEach((id, idx) => {
      const productSnap = productSnaps[idx];
      if (!productSnap.exists) throw new NotFoundException('Product not found');
      const data = productSnap.data()!;
      const levelSnap = levelSnaps[idx];
      result.set(id, {
        productId: id,
        productRef: productRefs[idx],
        levelRef: levelRefs[idx],
        currentStock: data.stock as number,
        currentLevelQty: levelSnap.exists ? (levelSnap.data()!.quantity as number) : 0,
        levelExists: levelSnap.exists,
        warehouseInfo: !levelSnap.exists ? warehouseInfo : undefined,
        sku: data.sku as string,
        name: data.name as string,
        minStockThreshold: data.minStockThreshold as number | undefined,
      });
    });
    return result;
  }

  applyStockDelta(tx: Transaction, ctx: StockUpdateContext, delta: number): StockChangedEvent {
    const nextStock = Math.max(0, ctx.currentStock + delta);
    tx.update(ctx.productRef, { stock: nextStock, updatedAt: FieldValue.serverTimestamp() });

    if (ctx.levelRef) {
      const nextQty = Math.max(0, ctx.currentLevelQty + delta);
      if (ctx.levelExists) {
        tx.update(ctx.levelRef, { quantity: nextQty, updatedAt: FieldValue.serverTimestamp() });
      } else if (ctx.warehouseInfo) {
        tx.set(ctx.levelRef, {
          productId: ctx.productId,
          warehouseId: ctx.warehouseInfo.id,
          warehouse: ctx.warehouseInfo,
          quantity: nextQty,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return {
      productId: ctx.productId,
      sku: ctx.sku,
      name: ctx.name,
      stock: nextStock,
      minStockThreshold: ctx.minStockThreshold,
    };
  }

  // --- Transaction-safe primitives for callers (Orders) that reserve stock
  // for several products inside one Firestore transaction. Firestore
  // requires ALL reads before ANY writes in a transaction, so the caller
  // must call getForUpdate() for every item first, then writeStockUpdate()
  // for every item — never interleaved.

  /** Batched equivalent of calling getForUpdate per item — one tx.getAll()
   * instead of N sequential tx.get() round trips (Orders' create /
   * createFromQuote, both reserving stock for every line in one go). */
  async getForUpdateMany(
    tx: Transaction,
    productIds: string[],
  ): Promise<Map<string, { ref: DocumentReference; product: Product }>> {
    const refs = productIds.map((id) => this.repo.doc(id));
    const snaps = refs.length > 0 ? await tx.getAll(...refs) : [];
    const result = new Map<string, { ref: DocumentReference; product: Product }>();
    snaps.forEach((snap, idx) => {
      if (!snap.exists) throw new NotFoundException('Product not found');
      const data = snap.data()!;
      result.set(productIds[idx], {
        ref: refs[idx],
        product: {
          ...data,
          id: snap.id,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
        } as Product,
      });
    });
    return result;
  }

  async getForUpdate(
    tx: Transaction,
    productId: string,
  ): Promise<{ ref: DocumentReference; product: Product }> {
    const ref = this.repo.doc(productId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundException('Product not found');
    const data = snap.data()!;
    return {
      ref,
      product: {
        ...data,
        id: snap.id,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
      } as Product,
    };
  }

  /** A product a customer can put in an order or quote: listed in the
   * storefront and priced. The API takes product ids from the request, so
   * without this an inactive (unlisted, maybe not yet priced) product
   * could be bought by id. */
  assertPurchasable(product: Product): void {
    if (!product.active || !(product.retailPrice > 0)) {
      throw new BadRequestException(`${product.name} no está disponible para la venta`);
    }
  }

  reserveStock(tx: Transaction, ref: DocumentReference, product: Product, qty: number): number {
    const nextStock = product.stock - qty;
    if (nextStock < 0) {
      throw new ConflictException(
        `Insufficient stock for ${product.sku}: ${product.stock} available, ${qty} requested`,
      );
    }
    tx.update(ref, { stock: nextStock, updatedAt: FieldValue.serverTimestamp() });
    return nextStock;
  }

  /** Every product keyed for ERP matching. Served from the catalog snapshot,
   * so a sync run costs about one read instead of one per product. */
  async findAllForErpMatching(): Promise<{
    byErpExternalId: Map<string, Product>;
    bySku: Map<string, Product>;
  }> {
    const all = this.viewsOf(await this.catalog.load(OPS_CATALOG_LOAD)).all;
    const byErpExternalId = new Map<string, Product>();
    const bySku = new Map<string, Product>();
    for (const product of all) {
      if (product.erpExternalId) byErpExternalId.set(product.erpExternalId, product);
      bySku.set(product.sku, product);
    }
    return { byErpExternalId, bySku };
  }

  /** The fields ERP sync can change — compared against `existing` so a run
   * where nothing actually changed writes nothing (dirty checking), instead
   * of rewriting every product on every 15-minute cron tick regardless. */
  private erpFieldsChanged(existing: Product, patch: Partial<Product>): boolean {
    return (
      existing.erpExternalId !== patch.erpExternalId ||
      existing.sku !== patch.sku ||
      existing.name !== patch.name ||
      existing.categoryId !== patch.categoryId ||
      existing.retailPrice !== patch.retailPrice ||
      existing.wholesalePrice !== patch.wholesalePrice ||
      existing.cost !== patch.cost ||
      existing.stock !== patch.stock ||
      existing.specs !== patch.specs
    );
  }

  /** `existing` must come from findAllForErpMatching() — resolved once per
   * sync run, not queried per item — so updating an existing product costs
   * no reads, and an unchanged one costs nothing at all. Every write is
   * recorded in `catalogChanges` for the caller to hand to
   * applyCatalogChanges() once, after the whole run. */
  async upsertFromErp(
    item: {
      externalId: string;
      sku: string;
      name: string;
      categoryId: string;
      category: { id: string; code: string; label: string };
      retailPrice: number;
      wholesalePrice: number;
      cost?: number;
      stock: number;
      specs?: string;
    },
    existing: Product | undefined,
    catalogChanges: ErpCatalogChanges,
  ): Promise<{ product: Product; wrote: boolean }> {
    const patch: Partial<Product> = {
      erpExternalId: item.externalId,
      sku: item.sku,
      name: item.name,
      categoryId: item.categoryId,
      category: item.category,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      stock: item.stock,
      // Optional on the ERP side: a field the bridge doesn't send keeps
      // whatever the product already has. Comparing against a bare
      // `undefined` here made every product with a manually entered cost
      // count as changed — and get rewritten — on every single run.
      cost: item.cost ?? existing?.cost,
      specs: item.specs ?? existing?.specs,
    };

    if (existing && !this.erpFieldsChanged(existing, patch)) {
      return { product: existing, wrote: false };
    }

    let saved: Product | null = null;
    let deletedId: string | undefined;
    if (existing) {
      const fields: Partial<Product> = { ...patch, erpSyncedAt: new Date() };
      try {
        // update() rather than the repository's set-merge: a product deleted
        // since the snapshot was taken fails here instead of coming back as a
        // doc holding only the ERP fields.
        await this.repo
          .doc(existing.id)
          .update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
        saved = { ...existing, ...fields, updatedAt: new Date() };
        catalogChanges.merge.push({
          id: existing.id,
          fields: { ...fields, updatedAt: saved.updatedAt },
        });
      } catch (error) {
        if ((error as { code?: number }).code !== GRPC_NOT_FOUND) throw error;
        deletedId = existing.id;
      }
    }
    const created = !saved;
    if (!saved) {
      saved = await this.createWithSlugId(item.name, {
        ...patch,
        erpSyncedAt: new Date(),
        active: true,
        qrToken: generateQrToken(),
      });
      catalogChanges.put.push(saved);
    }
    // The recreated product usually gets the freed-up slug back — only a
    // different id means the old one must leave the snapshot.
    if (deletedId && deletedId !== saved.id) catalogChanges.remove.push(deletedId);

    if (created || existing?.stock !== item.stock) {
      this.events.emit(STOCK_CHANGED_EVENT, {
        productId: saved.id,
        sku: saved.sku,
        name: saved.name,
        stock: saved.stock,
        minStockThreshold: saved.minStockThreshold,
      } satisfies StockChangedEvent);
    }

    return { product: saved, wrote: true };
  }
}
