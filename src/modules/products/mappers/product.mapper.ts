import { Role } from '../../../common/enums/role.enum';
import { PricingService } from '../pricing.service';
import { Product } from '../entities/product.entity';

export function toCatalogDto(product: Product, role: Role | undefined, pricing: PricingService) {
  const isAdmin = role === Role.ADMIN;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    specs: product.specs,
    category: {
      id: product.category.id,
      code: product.category.code,
      label: product.category.label,
    },
    price: pricing.priceFor(product),
    // Both price points are shown to every client — the wholesale figure is
    // informational; actually getting it requires an admin-approved quote.
    retailPrice: product.retailPrice,
    wholesalePrice: product.wholesalePrice,
    stock: product.stock,
    imageUrl: product.imageUrl,
    // Falls back to the full image for products uploaded before thumbnails existed.
    thumbnailUrl: product.thumbnailUrl ?? product.imageUrl,
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
