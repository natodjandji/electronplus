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
var ReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const firestore_1 = require("firebase-admin/firestore");
const firebase_constants_1 = require("../../firebase/firebase.constants");
const firestore_collections_1 = require("../../firebase/firestore-collections");
const firestore_repository_1 = require("../../firebase/firestore.repository");
const order_entity_1 = require("../orders/entities/order.entity");
const REVENUE_STATUSES = [order_entity_1.OrderStatus.PAID, order_entity_1.OrderStatus.FULFILLED];
function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}
let ReportsService = ReportsService_1 = class ReportsService {
    constructor(firestore) {
        this.firestore = firestore;
        this.logger = new common_1.Logger(ReportsService_1.name);
        this.summariesRepo = new firestore_repository_1.FirestoreRepository(firestore, firestore_collections_1.Collections.SALES_DAILY_SUMMARIES);
    }
    async rollupYesterday() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return this.rollupDay(yesterday);
    }
    async rollupDay(date) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const isoDate = toIsoDate(dayStart);
        const ordersSnap = await this.firestore
            .collection(firestore_collections_1.Collections.ORDERS)
            .where('status', 'in', REVENUE_STATUSES)
            .where('createdAt', '>=', firestore_1.Timestamp.fromDate(dayStart))
            .where('createdAt', '<', firestore_1.Timestamp.fromDate(dayEnd))
            .get();
        const salesTotal = ordersSnap.docs.reduce((sum, d) => sum + d.data().totalAmount, 0);
        const paymentsSnap = await this.firestore
            .collectionGroup(firestore_collections_1.Collections.SUPPLIER_PAYMENTS)
            .where('paidAt', '>=', firestore_1.Timestamp.fromDate(dayStart))
            .where('paidAt', '<', firestore_1.Timestamp.fromDate(dayEnd))
            .get();
        const purchasesTotal = paymentsSnap.docs.reduce((sum, d) => sum + d.data().amount, 0);
        const existing = await this.summariesRepo.findById(isoDate);
        const patch = { date: isoDate, salesTotal, purchasesTotal, ordersCount: ordersSnap.size };
        return existing ? this.summariesRepo.update(isoDate, patch) : this.summariesRepo.create(patch, isoDate);
    }
    async salesSeries(months = 7) {
        await this.rollupDay(new Date());
        const summaries = await this.summariesRepo.findAll({ orderBy: { field: 'date', direction: 'asc' } });
        const byMonth = new Map();
        for (const s of summaries) {
            const key = s.date.slice(0, 7);
            const bucket = byMonth.get(key) ?? { ventas: 0, compras: 0 };
            bucket.ventas += s.salesTotal;
            bucket.compras += s.purchasesTotal;
            byMonth.set(key, bucket);
        }
        return [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-months)
            .map(([month, totals]) => ({ month, ...totals }));
    }
    async categoryShare() {
        const ordersSnap = await this.firestore.collection(firestore_collections_1.Collections.ORDERS).where('status', 'in', REVENUE_STATUSES).get();
        const totalsByCategory = new Map();
        for (const doc of ordersSnap.docs) {
            const items = (doc.data().items ?? []);
            for (const item of items) {
                totalsByCategory.set(item.categoryLabel, (totalsByCategory.get(item.categoryLabel) ?? 0) + item.lineTotal);
            }
        }
        const grandTotal = [...totalsByCategory.values()].reduce((sum, v) => sum + v, 0);
        if (grandTotal === 0)
            return [...totalsByCategory.keys()].map((name) => ({ name, value: 0 }));
        return [...totalsByCategory.entries()].map(([name, total]) => ({
            name,
            value: Math.round((total / grandTotal) * 1000) / 10,
        }));
    }
    async cashFlow(from, to) {
        const ordersSnap = await this.firestore
            .collection(firestore_collections_1.Collections.ORDERS)
            .where('status', 'in', REVENUE_STATUSES)
            .where('createdAt', '>=', firestore_1.Timestamp.fromDate(from))
            .where('createdAt', '<=', firestore_1.Timestamp.fromDate(to))
            .get();
        const sales = ordersSnap.docs.reduce((sum, d) => sum + d.data().totalAmount, 0);
        const paymentsSnap = await this.firestore
            .collectionGroup(firestore_collections_1.Collections.SUPPLIER_PAYMENTS)
            .where('paidAt', '>=', firestore_1.Timestamp.fromDate(from))
            .where('paidAt', '<=', firestore_1.Timestamp.fromDate(to))
            .get();
        const purchases = paymentsSnap.docs.reduce((sum, d) => sum + d.data().amount, 0);
        return { sales, purchases, net: sales - purchases };
    }
    async profitability(from, to) {
        const ordersSnap = await this.firestore
            .collection(firestore_collections_1.Collections.ORDERS)
            .where('status', 'in', REVENUE_STATUSES)
            .where('createdAt', '>=', firestore_1.Timestamp.fromDate(from))
            .where('createdAt', '<=', firestore_1.Timestamp.fromDate(to))
            .get();
        const byProduct = new Map();
        for (const doc of ordersSnap.docs) {
            const items = (doc.data().items ?? []);
            for (const item of items) {
                const bucket = byProduct.get(item.productId) ?? {
                    sku: item.sku,
                    name: item.name,
                    unitsSold: 0,
                    revenue: 0,
                    margin: 0,
                };
                bucket.unitsSold += item.qty;
                bucket.revenue += item.lineTotal;
                bucket.margin += (item.unitPrice - (item.unitCost ?? 0)) * item.qty;
                byProduct.set(item.productId, bucket);
            }
        }
        return [...byProduct.entries()]
            .map(([productId, v]) => ({ productId, ...v }))
            .sort((a, b) => b.margin - a.margin);
    }
};
exports.ReportsService = ReportsService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_1AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReportsService.prototype, "rollupYesterday", null);
exports.ReportsService = ReportsService = ReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(firebase_constants_1.FIRESTORE)),
    __metadata("design:paramtypes", [Function])
], ReportsService);
//# sourceMappingURL=reports.service.js.map