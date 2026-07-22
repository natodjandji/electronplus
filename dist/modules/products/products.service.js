"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = exports.STOCK_CHANGED_EVENT = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const pagination_dto_1 = require("../../common/dto/pagination.dto");
exports.STOCK_CHANGED_EVENT = 'stock.changed';
function generateQrToken() {
    return (0, crypto_1.randomBytes)(24).toString('base64url');
}
let ProductsService = class ProductsService {
    constructor(firestore, events) {
        this.firestore = firestore;
        this.events = events;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.PRODUCTS);
        this.categoriesRepo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.CATEGORIES);
        this.warehousesRepo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.WAREHOUSES);
    }
    async findAll(query) {
        const limit = query.limit ?? 20;
        if (query.search) {
            const all = await this.repo.findAll({ where: [{ field: 'active', op: '==', value: true }] });
            const needle = query.search.toLowerCase();
            const filtered = all.filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle));
            const page = filtered.slice(0, limit);
            return new pagination_dto_1.PaginatedResult(page, filtered.length, query.page ?? 1, limit);
        }
        const where = [{ field: 'active', op: '==', value: true }];
        if (query.category) {
            const category = await this.categoriesRepo.findOne([{ field: 'code', op: '==', value: query.category }]);
            where.push({ field: 'categoryId', op: '==', value: category?.id ?? '__none__' });
        }
        const data = await this.repo.findAll({ where, orderBy: { field: 'name' }, limit });
        return new pagination_dto_1.PaginatedResult(data, data.length, query.page ?? 1, limit);
    }
    findById(id) {
        return this.repo.getOrThrow(id, 'Product not found');
    }
    async findByQrToken(token) {
        const product = await this.repo.findOne([{ field: 'qrToken', op: '==', value: token }]);
        if (!product)
            throw new common_1.NotFoundException('Product not found');
        return product;
    }
    async stockByWarehouse(productId) {
        const levelsRepo = new firestore_repository_1.FirestoreRepository(this.firestore, `${firestore_collections_1.Collections.PRODUCTS}/${productId}/${firestore_collections_1.Collections.STOCK_LEVELS}`);
        return levelsRepo.findAll();
    }
    async stockInWarehouse(warehouseId) {
        const snap = await this.firestore
            .collectionGroup(firestore_collections_1.Collections.STOCK_LEVELS)
            .where('warehouseId', '==', warehouseId)
            .get();
        return snap.docs.map((d) => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
            };
        });
    }
    async create(dto) {
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
    async update(id, dto) {
        const patch = { ...dto };
        if (dto.categoryId) {
            const category = await this.categoriesRepo.getOrThrow(dto.categoryId, 'Category not found');
            patch.category = { id: category.id, code: category.code, label: category.label };
        }
        return this.repo.update(id, patch);
    }
    async regenerateQrToken(id) {
        return this.repo.update(id, { qrToken: generateQrToken() });
    }
    async adjustStock(id, dto) {
        const productRef = this.repo.doc(id);
        const levelRef = dto.warehouseId ? productRef.collection(firestore_collections_1.Collections.STOCK_LEVELS).doc(dto.warehouseId) : undefined;
        const changed = await this.firestore.runTransaction(async (tx) => {
            const productSnap = await tx.get(productRef);
            if (!productSnap.exists)
                throw new common_1.NotFoundException('Product not found');
            const levelSnap = levelRef ? await tx.get(levelRef) : undefined;
            const warehouseSnap = levelRef && !levelSnap?.exists ? await tx.get(this.warehousesRepo.doc(dto.warehouseId)) : undefined;
            const data = productSnap.data();
            const nextStock = Math.max(0, data.stock + dto.delta);
            tx.update(productRef, { stock: nextStock, updatedAt: firestore_1.FieldValue.serverTimestamp() });
            if (levelRef) {
                const currentQty = levelSnap?.exists ? levelSnap.data().quantity : 0;
                const nextQty = Math.max(0, currentQty + dto.delta);
                if (levelSnap?.exists) {
                    tx.update(levelRef, { quantity: nextQty, updatedAt: firestore_1.FieldValue.serverTimestamp() });
                }
                else if (warehouseSnap?.exists) {
                    const w = warehouseSnap.data();
                    tx.set(levelRef, {
                        productId: id,
                        warehouseId: dto.warehouseId,
                        warehouse: { id: warehouseSnap.id, code: w.code, name: w.name },
                        quantity: nextQty,
                        createdAt: firestore_1.FieldValue.serverTimestamp(),
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                }
            }
            return {
                productId: id,
                sku: data.sku,
                name: data.name,
                stock: nextStock,
                minStockThreshold: data.minStockThreshold,
            };
        });
        this.events.emit(exports.STOCK_CHANGED_EVENT, changed);
        return this.findById(id);
    }
    async getForUpdate(tx, productId) {
        const ref = this.repo.doc(productId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new common_1.NotFoundException('Product not found');
        const data = snap.data();
        return {
            ref,
            product: {
                ...data,
                id: snap.id,
                createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
            },
        };
    }
    reserveStock(tx, ref, product, qty) {
        const nextStock = product.stock - qty;
        if (nextStock < 0) {
            throw new common_1.ConflictException(`Insufficient stock for ${product.sku}: ${product.stock} available, ${qty} requested`);
        }
        tx.update(ref, { stock: nextStock, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return nextStock;
    }
    restoreStock(tx, ref, product, qty) {
        const nextStock = product.stock + qty;
        tx.update(ref, { stock: nextStock, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return nextStock;
    }
    emitStockChanged(event) {
        this.events.emit(exports.STOCK_CHANGED_EVENT, event);
    }
    async upsertFromErp(item) {
        const existing = (await this.repo.findOne([{ field: 'erpExternalId', op: '==', value: item.externalId }])) ??
            (await this.repo.findOne([{ field: 'sku', op: '==', value: item.sku }]));
        const stockChanged = !existing || existing.stock !== item.stock;
        const patch = {
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
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, event_emitter_1.EventEmitter2])
], ProductsService);
//# sourceMappingURL=products.service.js.map