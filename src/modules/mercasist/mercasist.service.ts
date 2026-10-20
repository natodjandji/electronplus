import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { UpdateMercasistSettingsDto } from './dto/mercasist.dto';
import { MercasistClient } from './mercasist.client';
import {
  EXPORT_COLUMNS,
  exportBlocker,
  exportRow,
  mercasistPrice,
  normalizeSku,
} from './mercasist-plan';
import { MERCASIST_SETTINGS_DOC, MercasistSyncService } from './mercasist-sync.service';
import {
  DEFAULT_LISTING_TYPE,
  MercasistPage,
  MercasistPublication,
  MercasistSale,
} from './mercasist.types';
import { buildXlsx } from './xlsx';

const RECENT_SALES = 30;

/**
 * The panel's Mercasist section: its settings, a connection test, the
 * publications as the last run saw them, the Excel for Mercasist's bulk
 * publisher (products on the web that aren't on Mercado Libre yet), and
 * the Mercado Libre sales. The sync itself is MercasistSyncService.
 */
@Injectable()
export class MercasistService {
  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly client: MercasistClient,
    private readonly sync: MercasistSyncService,
    private readonly productsService: ProductsService,
  ) {}

  async status() {
    const [settings, snapshot] = await Promise.all([
      this.sync.readSettings(),
      this.sync.readSnapshot(),
    ]);
    return {
      configured: this.client.isConfigured(),
      enabled: Boolean(settings.enabled),
      syncPrice: settings.syncPrice !== false,
      syncStock: settings.syncStock !== false,
      syncContent: settings.syncContent !== false,
      notifyNewProducts: settings.notifyNewProducts !== false,
      safetyStock: settings.safetyStock ?? 0,
      listingType: settings.listingType ?? DEFAULT_LISTING_TYPE,
      lastSync: settings.lastSync,
      salesSince: settings.ordersBaselineAt,
      snapshotAt: snapshot.at,
      quota: this.client.quota(),
    };
  }

  async updateSettings(dto: UpdateMercasistSettingsDto) {
    if (dto.enabled && !this.client.isConfigured()) {
      throw new BadRequestException(
        'Falta el token de la API de Mercasist (MERCASIST_API_TOKEN) en el servidor.',
      );
    }
    const patch = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    await this.firestore
      .collection(Collections.SETTINGS)
      .doc(MERCASIST_SETTINGS_DOC)
      .set(patch, { merge: true });
    return this.status();
  }

  /** One small read: proves the token works and counts the Mercado Libre
   * publications Mercasist has. */
  async testConnection() {
    const page = await this.client.get<MercasistPage<MercasistPublication>>('/publicaciones', {
      tipo: 'ML',
      limit: 1,
    });
    return { ok: true, activePublications: page?.pagination?.total ?? page?.data?.length ?? 0 };
  }

  /** As the last run (or preview) saw them, with the web's product. */
  async publications() {
    const [snapshot, catalog] = await Promise.all([
      this.sync.readSnapshot(),
      this.productsService.catalogLookup(),
    ]);
    return {
      at: snapshot.at,
      rows: snapshot.rows.map((row) => {
        const product = row.productId ? catalog.get(row.productId) : undefined;
        return {
          ...row,
          ...(product && {
            product: { id: product.id, name: product.name, price: mercasistPrice(product) },
          }),
        };
      }),
    };
  }

  /**
   * Products on the web that aren't on Mercado Libre yet and can be: on
   * sale, with a SKU, a photo and stock. "Yet" is by SKU against the
   * publications the last run or preview saw, so one should run first.
   */
  async exportCandidates(): Promise<{
    ready: Product[];
    blocked: { reason: string; count: number }[];
    published: number;
    snapshotAt?: string;
  }> {
    const [settings, snapshot, products] = await Promise.all([
      this.sync.readSettings(),
      this.sync.readSnapshot(),
      this.productsService.allForMarketplace(),
    ]);
    const listed = new Set(snapshot.rows.map((r) => normalizeSku(r.sku)).filter(Boolean));
    const safety = settings.safetyStock ?? 0;
    const ready: Product[] = [];
    const blocked = new Map<string, number>();
    let published = 0;
    for (const product of products) {
      if (listed.has(normalizeSku(product.sku))) {
        published++;
        continue;
      }
      const reason = exportBlocker(product, safety);
      if (reason) blocked.set(reason, (blocked.get(reason) ?? 0) + 1);
      else ready.push(product);
    }
    return {
      ready,
      blocked: [...blocked].map(([reason, count]) => ({ reason, count })),
      published,
      snapshotAt: snapshot.at,
    };
  }

  async exportSummary() {
    const { ready, blocked, published, snapshotAt } = await this.exportCandidates();
    return { ready: ready.length, blocked, published, snapshotAt };
  }

  /** The bulk publisher's Excel: everything ready, or one group of it. */
  async exportXlsx(lote?: number, tamano?: number) {
    const [settings, { ready }] = await Promise.all([
      this.sync.readSettings(),
      this.exportCandidates(),
    ]);
    const products = tamano ? ready.slice(((lote ?? 1) - 1) * tamano, (lote ?? 1) * tamano) : ready;
    if (products.length === 0) {
      throw new BadRequestException('No hay productos nuevos para publicar en ese lote.');
    }
    const listingType = settings.listingType ?? DEFAULT_LISTING_TYPE;
    const safety = settings.safetyStock ?? 0;
    const rows = [
      [...EXPORT_COLUMNS],
      ...products.map((product) => exportRow(product, listingType, safety)),
    ];
    const day = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
      buffer: buildXlsx('Publicaciones', rows),
      filename: `electronplus-mercado-libre-${day}${tamano ? `-lote-${lote ?? 1}` : ''}.xlsx`,
      count: products.length,
    };
  }

  async sales(): Promise<MercasistSale[]> {
    const snap = await this.firestore
      .collection(Collections.MERCASIST_SALES)
      .orderBy('date', 'desc')
      .limit(RECENT_SALES)
      .get();
    return snap.docs.map((doc) => ({ ...(doc.data() as MercasistSale), id: doc.id }));
  }
}
