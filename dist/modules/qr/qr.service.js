"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const QRCode = __importStar(require("qrcode"));
const role_enum_1 = require("../../common/enums/role.enum");
const product_mapper_1 = require("../products/mappers/product.mapper");
const pricing_service_1 = require("../products/pricing.service");
const products_service_1 = require("../products/products.service");
let QrService = class QrService {
    constructor(productsService, pricingService, config) {
        this.productsService = productsService;
        this.pricingService = pricingService;
        this.config = config;
    }
    async issueLabel(productId) {
        const product = await this.productsService.findById(productId);
        const scanUrl = `${this.config.get('API_PUBLIC_URL', { infer: true })}/qr/scan/${product.qrToken}`;
        const qrImageDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 256 });
        return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            retailPrice: product.retailPrice,
            token: product.qrToken,
            scanUrl,
            qrImageDataUrl,
        };
    }
    async issueLabels(productIds) {
        return Promise.all(productIds.map((id) => this.issueLabel(id)));
    }
    async scan(token, user) {
        const product = await this.productsService.findByQrToken(token);
        const base = (0, product_mapper_1.toCatalogDto)(product, user?.role, this.pricingService);
        if (user?.role === role_enum_1.Role.ADMIN) {
            const stockByWarehouse = await this.productsService.stockByWarehouse(product.id);
            return {
                ...base,
                internal: true,
                stockByWarehouse: stockByWarehouse.map((s) => ({
                    warehouse: s.warehouse.name,
                    location: s.location,
                    quantity: s.quantity,
                })),
            };
        }
        return { ...base, internal: false };
    }
};
exports.QrService = QrService;
exports.QrService = QrService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [products_service_1.ProductsService,
        pricing_service_1.PricingService,
        config_1.ConfigService])
], QrService);
//# sourceMappingURL=qr.service.js.map