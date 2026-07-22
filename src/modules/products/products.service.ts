import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { StockLevel } from './entities/stock-level.entity';
import { Warehouse } from './entities/warehouse.entity';

export const STOCK_CHANGED_EVENT = 'stock.changed';

export interface StockChangedEvent {
  productId: string;
  sku: string;
  name: string;
  stock: number;
  minStockThreshold?: number;
}

function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

@Injectable()
export class ProductsService {
  private readonly repo: FirestoreRepository<Product>;
  private readonly categoriesRepo: FirestoreRepository<Category>;
  private readonly warehousesRepo: FirestoreRepository<Warehouse>;

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

    if (query.search) {
      // Firestore has no full-text search — scan active products (bounded)
      // and filter in Node. Fine at this catalog's scale.
      const all = await this.repo.findAll({ where: [{ field: 'active', op: '==', value: true }] });
      const needle = query.search.toLowerCase();
      const filtered = all.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle),
      );
      const page = filtered.slice(0, limit);
      return new PaginatedResult(page, filtered.length, query.page ?? 1, limit);
    }

    const where: { field: string; op: '=='; value: unknown }[] = [{ field: 'active', op: '==', value: true }];
    if (query.category) {
      const category = await this.categoriesRepo.findOne([{ field: 'code', op: '==', value: query.category }]);
      where.push({ field: 'categoryId', op: '==', value: category?.id ?? '__none__' });
    }
    const data = await this.repo.findAll({ where, orderBy: { field: 'name' }, limit });
    return new PaginatedResult(data, data.length, query.page ?? 1, limit);
  }

  findById(id: string): Promise<Product> {
    return this.repo.getOrThrow(id, 'Product not found');
  }

  async findByQrToken(token: string): Promise<Product> {
    const product = await this.repo.findOne([{ field: 'qrToken', op: '==', value: token }]);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async stockByWarehouse(productId: string): Promise<StockLevel[]> {
    const levelsRepo = new FirestoreRepository<StockLevel>(
      this.firestore,
      `${Collections.PRODUCTS}/${productId}/${Collections.STOCK_LEVELS}`,
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
      retailPrice: dto.retailPrice,
      wholesalePrice: dto.wholesalePrice,
      cost: dto.cost,
      stock: 0,
      minStockThreshold: dto.minStockThreshold,
      imageUrl: dto.imageUrl,
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

  async regenerateQrToken(id: string): Promise<Product> {
    return this.repo.update(id, { qrToken: generateQrToken() });
  }

  /** Manual admin stock adjustment (+ restock / - shrinkage), optionally scoped to a warehouse. */
  async adjustStock(id: string, dto: AdjustStockDto): Promise<Product> {
    const productRef = this.repo.doc(id);
    const levelRef = dto.warehouseId ? productRef.collection(Collections.STOCK_LEVELS).doc(dto.warehouseId) : undefined;

    const changed = await this.firestore.runTransaction(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throw new NotFoundException('Product not found');
      const levelSnap = levelRef ? await tx.get(levelRef) : undefined;
      const warehouseSnap =
        levelRef && !levelSnap?.exists ? await tx.get(this.warehousesRepo.doc(dto.warehouseId!)) : undefined;

      const data = productSnap.data()!;
      const nextStock = Math.max(0, (data.stock as number) + dto.delta);
      tx.update(productRef, { stock: nextStock, updatedAt: FieldValue.serverTimestamp() });

      if (levelRef) {
        const currentQty = levelSnap?.exists ? (levelSnap.data()!.quantity as number) : 0;
        const nextQty = Math.max(0, currentQty + dto.delta);
        if (levelSnap?.exists) {
          tx.update(levelRef, { quantity: nextQty, updatedAt: FieldValue.serverTimestamp() });
        } else if (warehouseSnap?.exists) {
          const w = warehouseSnap.data()!;
          tx.set(levelRef, {
            productId: id,
            warehouseId: dto.warehouseId,
            warehouse: { id: warehouseSnap.id, code: w.code, name: w.name },
            quantity: nextQty,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      return {
        productId: id,
        sku: data.sku as string,
        name: data.name as string,
        stock: nextStock,
        minStockThreshold: data.minStockThreshold as number | undefined,
      } satisfies StockChangedEvent;
    });

    this.events.emit(STOCK_CHANGED_EVENT, changed);
    return this.findById(id);
  }

  // --- Transaction-safe primitives for callers (Orders) that reserve stock
  // for several products inside one Firestore transaction. Firestore
  // requires ALL reads before ANY writes in a transaction, so the caller
  // must call getForUpdate() for every item first, then writeStockUpdate()
  // for every item — never interleaved.

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
      throw new ConflictException(`Insufficient stock for ${product.sku}: ${product.stock} available, ${qty} requested`);
    }
    tx.update(ref, { stock: nextStock, updatedAt: FieldValue.serverTimestamp() });
    return nextStock;
  }

  restoreStock(tx: Transaction, ref: DocumentReference, product: Product, qty: number): number {
    const nextStock = product.stock + qty;
    tx.update(ref, { stock: nextStock, updatedAt: FieldValue.serverTimestamp() });
    return nextStock;
  }

  emitStockChanged(event: StockChangedEvent): void {
    this.events.emit(STOCK_CHANGED_EVENT, event);
  }

  /** Inbound ERP sync: create or update a product from a Profit Plus inventory record. */
  async upsertFromErp(item: {
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
  }): Promise<Product> {
    const existing =
      (await this.repo.findOne([{ field: 'erpExternalId', op: '==', value: item.externalId }])) ??
      (await this.repo.findOne([{ field: 'sku', op: '==', value: item.sku }]));

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
      erpSyncedAt: new Date(),
    };

    const saved = existing
      ? await this.repo.update(existing.id, patch)
      : await this.repo.create({ ...patch, active: true, qrToken: generateQrToken() });

    if (stockChanged) {
      this.emitStockChanged({
        productId: saved.id,
        sku: saved.sku,
        name: saved.name,
        stock: saved.stock,
        minStockThreshold: saved.minStockThreshold,
      });
    }

    return saved;
  }
}
