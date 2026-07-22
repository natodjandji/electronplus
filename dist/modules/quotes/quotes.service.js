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
exports.QuotesService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const role_enum_1 = require("../../common/enums/role.enum");
const pricing_service_1 = require("../products/pricing.service");
const products_service_1 = require("../products/products.service");
const quote_entity_1 = require("./entities/quote.entity");
let QuotesService = class QuotesService {
    constructor(firestore, productsService, pricingService) {
        this.productsService = productsService;
        this.pricingService = pricingService;
        this.repo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.QUOTES);
    }
    async create(user, dto) {
        return this.repo.create({
            userId: user.id,
            customerName: dto.customerName,
            customerTaxId: dto.customerTaxId,
            status: quote_entity_1.QuoteStatus.DRAFT,
            globalDiscountPct: 0,
            items: [],
        });
    }
    findMine(user) {
        return this.repo.findAll({
            where: [{ field: 'userId', op: '==', value: user.id }],
            orderBy: { field: 'createdAt', direction: 'desc' },
        });
    }
    findAll() {
        return this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
    }
    async findOneForUser(id, user) {
        const quote = await this.repo.getOrThrow(id, 'Quote not found');
        if (quote.userId !== user.id && user.role !== role_enum_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('This quote does not belong to you');
        }
        return quote;
    }
    async addLine(id, user, dto) {
        const quote = await this.assertEditable(id, user);
        const product = await this.productsService.findById(dto.productId);
        const unitPrice = this.pricingService.priceFor(product);
        const item = {
            id: (0, crypto_1.randomUUID)(),
            productId: product.id,
            sku: product.sku,
            name: product.name,
            qty: dto.qty,
            unitPrice,
            discountPct: dto.discountPct ?? 0,
        };
        return this.repo.update(id, { items: [...quote.items, item] });
    }
    async updateLine(id, lineId, user, dto) {
        const quote = await this.assertEditable(id, user);
        const items = quote.items.map((item) => item.id === lineId
            ? { ...item, qty: dto.qty ?? item.qty, discountPct: dto.discountPct ?? item.discountPct }
            : item);
        if (!items.some((i) => i.id === lineId))
            throw new common_1.NotFoundException('Quote line not found');
        return this.repo.update(id, { items });
    }
    async removeLine(id, lineId, user) {
        const quote = await this.assertEditable(id, user);
        return this.repo.update(id, { items: quote.items.filter((i) => i.id !== lineId) });
    }
    async setGlobalDiscount(id, user, globalDiscountPct) {
        await this.assertNotFinalized(id, user);
        return this.repo.update(id, { globalDiscountPct });
    }
    async send(id, user) {
        await this.assertEditable(id, user);
        return this.repo.update(id, { status: quote_entity_1.QuoteStatus.SENT });
    }
    async approve(id, user) {
        const quote = await this.findOneForUser(id, user);
        if (quote.status !== quote_entity_1.QuoteStatus.SENT) {
            throw new common_1.ForbiddenException('Only sent quotes can be approved');
        }
        return this.repo.update(id, { status: quote_entity_1.QuoteStatus.APPROVED });
    }
    async reject(id, user, reason) {
        const quote = await this.findOneForUser(id, user);
        if (quote.status !== quote_entity_1.QuoteStatus.SENT) {
            throw new common_1.ForbiddenException('Only sent quotes can be rejected');
        }
        return this.repo.update(id, { status: quote_entity_1.QuoteStatus.REJECTED, rejectionReason: reason });
    }
    async assertEditable(id, user) {
        const quote = await this.findOneForUser(id, user);
        if (quote.status !== quote_entity_1.QuoteStatus.DRAFT) {
            throw new common_1.ForbiddenException('Only draft quotes can be edited');
        }
        return quote;
    }
    async assertNotFinalized(id, user) {
        const quote = await this.findOneForUser(id, user);
        if (quote.status === quote_entity_1.QuoteStatus.APPROVED || quote.status === quote_entity_1.QuoteStatus.REJECTED) {
            throw new common_1.ForbiddenException('Cannot change the discount on a finalized quote');
        }
        return quote;
    }
};
exports.QuotesService = QuotesService;
exports.QuotesService = QuotesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function, products_service_1.ProductsService,
        pricing_service_1.PricingService])
], QuotesService);
//# sourceMappingURL=quotes.service.js.map