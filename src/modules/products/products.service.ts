import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, WhereClause } from '../../firebase/firestore.repository';
import { PaginatedResult } from '../../common/dto/pagination.dto';
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

function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

// topSelling() backs the public homepage and re-scans up to 90 days of
// orders on every call — cached briefly per `limit` so the busiest
// unauthenticated route on the site doesn't rescan on every visit.
const TOP_SELLING_CACHE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ProductsService {
  private readonly repo: FirestoreRepository<Product>;
  private readonly categoriesRepo: FirestoreRepository<Category>;
  private readonly warehousesRepo: FirestoreRepository<Warehouse>;
  private readonly topSellingCache = new Map<number, { data: Product[]; cachedAt: number }>();

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Product>(firestore, Collections.PRODUCTS);
    this.categoriesRepo = new FirestoreRepository<Category>(firestore, Collections.CATEGORIES);
    this.warehousesRepo = new FirestoreRepository<Warehouse>(firestore, Collections.WAREHOUSES);
  }

  async findAll(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const skip = (page - 1) * limit;

    if (query.search) {
      // Firestore has no full-text search — scan active products (bounded)
      // and filter in Node. Fine at this catalog's scale. `page` slices the
      // in-memory filtered array directly (was previously ignored, always
      // returning page 1's results for every page).
      const all = await this.repo.findAll({ where: [{ field: 'active', op: '==', value: true }] });
      const needle = query.search.toLowerCase();
      const filtered = all.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
      const data = filtered.slice(skip, skip + limit);
      return new PaginatedResult(data, filtered.length, page, limit);
    }

    const where: { field: string; op: '=='; value: unknown }[] = [
      { field: 'active', op: '==', value: true },
    ];
    if (query.category) {
      const category = await this.categoriesRepo.findOne([
        { field: 'code', op: '==', value: query.category },
      ]);
      where.push({ field: 'categoryId', op: '==', value: category?.id ?? '__none__' });
    }
    // `total` is a real count of every matching doc, not `data.length` (was
    // previously capped at `limit`, so `pageCount` always came out as 1 —
    // every caller past page 1 got page 1's results back with no error).
    const [data, total] = await Promise.all([
      this.repo.findAll({ where, orderBy: { field: 'name' }, limit, offset: skip }),
      this.repo.count(where),
    ]);
    return new PaginatedResult(data, total, page, limit);
  }

  findById(id: string): Promise<Product> {
    return this.repo.getOrThrow(id, 'Product not found');
  }

  findByIds(ids: string[]): Promise<Product[]> {
    return this.repo.findByIds(ids);
  }

  /** Best-selling active products by units sold across paid/fulfilled orders in the last 90
   * days — falls back to filling remaining slots with other active products so a fresh store
   * never looks sparse. Bounded to a recent window (rather than the full order history) since
   * this backs the public, unauthenticated /products/best-sellers endpoint hit on every
   * storefront visit — an unbounded scan would grow more expensive with every order ever placed. */
  async topSelling(limit = 8): Promise<Product[]> {
    const cached = this.topSellingCache.get(limit);
    if (cached && Date.now() - cached.cachedAt < TOP_SELLING_CACHE_TTL_MS) {
      return cached.data;
    }

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

    const rankedIds = [...unitsSold.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([productId]) => productId)
      .slice(0, limit * 3); // bounded candidate pool — some may turn out inactive

    const candidates = await this.repo.findByIds(rankedIds);
    const byId = new Map(candidates.map((p) => [p.id, p]));
    const ranked = rankedIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => Boolean(p?.active))
      .slice(0, limit);

    if (ranked.length < limit) {
      const filler = await this.repo.findAll({
        where: [{ field: 'active', op: '==', value: true }],
        orderBy: { field: 'name' },
        limit: limit * 2,
      });
      const seen = new Set(ranked.map((p) => p.id));
      for (const product of filler) {
        if (ranked.length >= limit) break;
        if (!seen.has(product.id)) ranked.push(product);
      }
    }

    this.topSellingCache.set(limit, { data: ranked, cachedAt: Date.now() });
    return ranked;
  }

  /** Full-fidelity listing for the admin inventory panel — includes inactive
   * products and cost/supplier fields. Filtered in Node, same tradeoff as
   * the public search above: fine at this catalog's scale. */
  async adminFindAll(query: AdminQueryProductsDto): Promise<Product[]> {
    // supplierId/categoryId are simple equality filters — pushed down to
    // Firestore's `where` instead of fetching the whole collection and
    // filtering in Node, same result with far fewer documents read whenever
    // either is set. search/lowStockOnly stay Node-side (substring match /
    // computed threshold, not expressible as a Firestore equality filter).
    const where: WhereClause[] = [];
    if (query.supplierId) where.push({ field: 'supplierId', op: '==', value: query.supplierId });
    if (query.categoryId) where.push({ field: 'categoryId', op: '==', value: query.categoryId });

    let products = await this.repo.findAll({ where, orderBy: { field: 'name' } });

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

  async create(dto: CreateProductDto): Promise<Product> {
    const category = await this.categoriesRepo.getOrThrow(dto.categoryId, 'Category not found');
    return this.repo.create({
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
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const patch: Partial<Product> = { ...dto };
    if (dto.categoryId) {
      const category = await this.categoriesRepo.getOrThrow(dto.categoryId, 'Category not found');
      patch.category = { id: category.id, code: category.code, label: category.label };
    }
    return this.repo.update(id, patch);
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
  }

  /** Manual admin stock adjustment (+ restock / - shrinkage), optionally scoped to a warehouse. */
  async adjustStock(id: string, dto: AdjustStockDto): Promise<Product> {
    const changed = await this.firestore.runTransaction(async (tx) => {
      const ctx = await this.getStockForUpdate(tx, id, dto.warehouseId);
      return this.applyStockDelta(tx, ctx, dto.delta);
    });

    this.events.emit(STOCK_CHANGED_EVENT, changed);
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

  emitStockChanged(event: StockChangedEvent): void {
    this.events.emit(STOCK_CHANGED_EVENT, event);
  }

  /** Inbound ERP sync: create or update a product from a Profit Plus inventory record. */
  /** One read for the whole sync run instead of 1-2 findOne() queries per
   * ERP item — every item is matched in memory against these maps. */
  async findAllForErpMatching(): Promise<{
    byErpExternalId: Map<string, Product>;
    bySku: Map<string, Product>;
  }> {
    const all = await this.repo.findAll();
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
   * sync run, not queried per item — so this call does zero Firestore reads
   * and, when nothing changed since the last sync, zero writes. */
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
  ): Promise<{ product: Product; wrote: boolean }> {
    const stockChanged = !existing || existing.stock !== item.stock;

    const patch: Partial<Product> = {
      erpExternalId: item.externalId,
      sku: item.sku,
      name: item.name,
      categoryId: item.categoryId,
      category: item.category,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      cost: item.cost,
      stock: item.stock,
      specs: item.specs ?? existing?.specs,
    };

    if (existing && !this.erpFieldsChanged(existing, patch)) {
      return { product: existing, wrote: false };
    }

    const saved = existing
      ? await this.repo.update(existing.id, { ...patch, erpSyncedAt: new Date() })
      : await this.repo.create({
          ...patch,
          erpSyncedAt: new Date(),
          active: true,
          qrToken: generateQrToken(),
        });

    if (stockChanged) {
      this.emitStockChanged({
        productId: saved.id,
        sku: saved.sku,
        name: saved.name,
        stock: saved.stock,
        minStockThreshold: saved.minStockThreshold,
      });
    }

    return { product: saved, wrote: true };
  }
}
