import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { EnvConfig } from '../../config/env.validation';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { toCatalogDto } from '../products/mappers/product.mapper';
import { Product } from '../products/entities/product.entity';
import { PricingService } from '../products/pricing.service';
import { ProductsService } from '../products/products.service';

export interface QrLabel {
  productId: string;
  sku: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  token: string;
  /** The product's public storefront page — what the printed QR code encodes. */
  productUrl: string;
  qrImageDataUrl: string;
}

@Injectable()
export class QrService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private async buildLabel(product: Product): Promise<QrLabel> {
    // Points at the real storefront product page — not the backend API —
    // so scanning the printed label opens a normal webpage for anyone.
    const productUrl = `${this.config.get('PUBLIC_SITE_URL', { infer: true })}/product/qr/${product.id}`;
    const qrImageDataUrl = await QRCode.toDataURL(productUrl, { margin: 1, width: 256 });
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      token: product.qrToken,
      productUrl,
      qrImageDataUrl,
    };
  }

  async issueLabel(productId: string): Promise<QrLabel> {
    const product = await this.productsService.findById(productId);
    return this.buildLabel(product);
  }

  /** Bulk label printing can cover an arbitrary admin-selected slice of the
   * catalog — batch the product lookup (one Firestore round trip) instead
   * of issueLabel's one-read-per-id, same fix already applied to
   * second-store.service.ts's findAll. */
  async issueLabels(productIds: string[]): Promise<QrLabel[]> {
    const products = await this.productsService.findByIds(productIds);
    const byId = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Product(s) not found: ${missing.join(', ')}`);
    }
    return Promise.all(productIds.map((id) => this.buildLabel(byId.get(id)!)));
  }

  /**
   * Role-aware QR scan payload: an authenticated Admin gets full internal
   * detail (stock by warehouse, cost, location); everyone else — public or
   * a logged-in client — gets commercial data only.
   */
  async scan(token: string, user?: AuthenticatedUser) {
    const product = await this.productsService.findByQrToken(token);
    const base = toCatalogDto(product, user?.role, this.pricingService);

    if (user?.role === Role.ADMIN) {
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

    // user.role is never ADMIN on this branch, so toCatalogDto already
    // omitted cost/thresholds/erpSyncedAt — nothing further to strip.
    return { ...base, internal: false };
  }
}
