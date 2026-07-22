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
exports.ProductsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const role_enum_1 = require("../../common/enums/role.enum");
const firebase_auth_guard_1 = require("../../common/guards/firebase-auth.guard");
const optional_firebase_auth_guard_1 = require("../../common/guards/optional-firebase-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const categories_service_1 = require("./categories.service");
const adjust_stock_dto_1 = require("./dto/adjust-stock.dto");
const create_product_dto_1 = require("./dto/create-product.dto");
const query_products_dto_1 = require("./dto/query-products.dto");
const update_product_dto_1 = require("./dto/update-product.dto");
const product_mapper_1 = require("./mappers/product.mapper");
const pricing_service_1 = require("./pricing.service");
const products_service_1 = require("./products.service");
const warehouses_service_1 = require("./warehouses.service");
let ProductsController = class ProductsController {
    constructor(productsService, pricingService, categoriesService, warehousesService) {
        this.productsService = productsService;
        this.pricingService = pricingService;
        this.categoriesService = categoriesService;
        this.warehousesService = warehousesService;
    }
    categories() {
        return this.categoriesService.findAll();
    }
    warehouses() {
        return this.warehousesService.findAll();
    }
    async findAll(query, user) {
        const result = await this.productsService.findAll(query);
        return {
            ...result,
            data: result.data.map((p) => (0, product_mapper_1.toCatalogDto)(p, user?.role, this.pricingService)),
        };
    }
    async findOne(id, user) {
        const product = await this.productsService.findById(id);
        return (0, product_mapper_1.toCatalogDto)(product, user?.role, this.pricingService);
    }
    create(dto) {
        return this.productsService.create(dto);
    }
    update(id, dto) {
        return this.productsService.update(id, dto);
    }
    adjustStock(id, dto) {
        return this.productsService.adjustStock(id, dto);
    }
    stockByWarehouse(id) {
        return this.productsService.stockByWarehouse(id);
    }
};
exports.ProductsController = ProductsController;
__decorate([
    (0, common_1.Get)('categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "categories", null);
__decorate([
    (0, common_1.Get)('warehouses'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "warehouses", null);
__decorate([
    (0, common_1.Get)('products'),
    (0, common_1.UseGuards)(optional_firebase_auth_guard_1.OptionalFirebaseAuthGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_products_dto_1.QueryProductsDto, Object]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('products/:id'),
    (0, common_1.UseGuards)(optional_firebase_auth_guard_1.OptionalFirebaseAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ProductsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_product_dto_1.CreateProductDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('products/:id'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_product_dto_1.UpdateProductDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)('products/:id/stock'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, adjust_stock_dto_1.AdjustStockDto]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "adjustStock", null);
__decorate([
    (0, common_1.Get)('products/:id/stock-by-warehouse'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(role_enum_1.Role.ADMIN, role_enum_1.Role.WAREHOUSE_OPERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProductsController.prototype, "stockByWarehouse", null);
exports.ProductsController = ProductsController = __decorate([
    (0, swagger_1.ApiTags)('products'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [products_service_1.ProductsService,
        pricing_service_1.PricingService,
        categories_service_1.CategoriesService,
        warehouses_service_1.WarehousesService])
], ProductsController);
//# sourceMappingURL=products.controller.js.map