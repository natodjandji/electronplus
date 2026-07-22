"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCatalogDto = toCatalogDto;
const role_enum_1 = require("../../../common/enums/role.enum");
function toCatalogDto(product, role, pricing) {
    const isAdmin = role === role_enum_1.Role.ADMIN;
    return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        specs: product.specs,
        category: { id: product.category.id, code: product.category.code, label: product.category.label },
        price: pricing.priceFor(product),
        retailPrice: product.retailPrice,
        wholesalePrice: product.wholesalePrice,
        stock: product.stock,
        imageUrl: product.imageUrl,
        active: product.active,
        ...(isAdmin
            ? {
                cost: product.cost,
                minStockThreshold: product.minStockThreshold,
                erpSyncedAt: product.erpSyncedAt,
            }
            : {}),
    };
}
//# sourceMappingURL=product.mapper.js.map