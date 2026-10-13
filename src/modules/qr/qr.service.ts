import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { EnvConfig } from '../../config/env.validation';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';

export interface QrLabel {
  productId: string;
  sku: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  /** The product's public storefront page — what every printed QR code encodes. */
  productUrl: string;
  /** QR pointing at the storefront page — used by both the "precio" and "almacén" label formats. */
  qrImageDataUrl: string;
  /** Scannable Code128 barcode encoding the SKU — the "producto" label format. */
  barcodeImageDataUrl: string;
}

@Injectable()
export class QrService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Code128 encodes any ASCII text, no separate numeric-only barcode value
   * needed — the SKU itself (e.g. "EP-LED-9W") is what's on the label and
   * what a scanner reads back. */
  private async buildBarcodeDataUrl(sku: string): Promise<string> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: sku,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  private async buildLabel(product: Product): Promise<QrLabel> {
    // Points at the real storefront product page — not the backend API —
    // so scanning the printed label opens a normal webpage for anyone.
    const productUrl = `${this.config.get('PUBLIC_SITE_URL', { infer: true })}/product/qr/${product.id}`;
    const [qrImageDataUrl, barcodeImageDataUrl] = await Promise.all([
      QRCode.toDataURL(productUrl, { margin: 1, width: 256 }),
      this.buildBarcodeDataUrl(product.sku),
    ]);
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      barcodeImageDataUrl,
      productUrl,
      qrImageDataUrl,
    };
  }

  /** Bulk label printing can cover an arbitrary admin-selected slice of the
   * catalog — batch the product lookup (one Firestore round trip) instead
   * of one read per product. */
  async issueLabels(productIds: string[]): Promise<QrLabel[]> {
    const products = await this.productsService.findByIds(productIds);
    const byId = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Product(s) not found: ${missing.join(', ')}`);
    }
    return Promise.all(productIds.map((id) => this.buildLabel(byId.get(id)!)));
  }
}
