import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { removalAllowed } from '../../common/utils/removal-guard';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { FinanceService } from '../finance/finance.service';
import { CategoriesService } from '../products/categories.service';
import { Product } from '../products/entities/product.entity';
import { ErpCatalogChanges, ProductsService } from '../products/products.service';
import {
  ErpInventoryItem,
  ErpNotConfiguredError,
  PROFIT_PLUS_ADAPTER,
  ProfitPlusAdapter,
} from './adapters/profit-plus-adapter.interface';
import { SyncDirection, SyncLog, SyncStatus, syncLogExpiresAt } from './entities/sync-log.entity';

/**
 * Syncs the PRINCIPAL store's Profit Plus install into the main `products`
 * collection — full catalog (code, description, category, stock, both
 * prices) via profit-plus-bridge-principal / ApiProfitPlusAdapter. This is
 * a distinct system from the SECUNDARIA store's integration
 * (SecondStoreSyncService, ../second-store/second-store-sync.service.ts):
 * different SQL Server, different bridge, different field contract
 * (description+stock only), different Firestore collection
 * (secondStoreProducts). Don't merge their config, cron, or logic — the
 * two ERP installs are unrelated beyond both being "Profit Plus".
 */
const INBOUND_CRON_JOB_NAME = 'profit-plus-inbound-sync';

export const ERP_SYNC_ERROR_EVENT = 'erp.sync.error';

export interface ErpSyncErrorEvent {
  direction: SyncDirection;
  message: string;
  reference?: string;
}

/** Each value that appears more than once, once. */
function repeatedValues(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated];
}

/** One product per Profit Plus code. A row without a code can't be matched
 * from one run to the next, and a code that comes twice would create two
 * products — or flip one between both rows every run. The first row of a
 * code wins; the rest are left out and named in the log. */
function uniqueByCode(rows: ErpInventoryItem[]): {
  items: ErpInventoryItem[];
  skipped: string[];
} {
  const seen = new Set<string>();
  const items: ErpInventoryItem[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (!row.externalId) skipped.push(`(sin código) ${row.name}`.trim());
    else if (seen.has(row.externalId)) skipped.push(row.externalId);
    else {
      seen.add(row.externalId);
      items.push(row);
    }
  }
  return { items, skipped };
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private readonly repo: FirestoreRepository<SyncLog>;

  constructor(
    @Inject(PROFIT_PLUS_ADAPTER) private readonly adapter: ProfitPlusAdapter,
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly financeService: FinanceService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<SyncLog>(firestore, Collections.SYNC_LOGS);
  }

  onModuleInit(): void {
    const cronExpression = this.config.get('PROFIT_PLUS_SYNC_CRON', { infer: true });
    const job = new CronJob(cronExpression, () => {
      this.runInboundSync().catch((error) => {
        // Expected until the bridge is deployed — not worth an error per tick.
        if (error instanceof ErpNotConfiguredError) this.logger.warn(error.message);
        else this.logger.error('Scheduled inbound sync failed', error as Error);
      });
    });
    this.schedulerRegistry.addCronJob(INBOUND_CRON_JOB_NAME, job);
    job.start();
  }

  isConfigured(): boolean {
    return this.adapter.isConfigured();
  }

  async runInboundSync(): Promise<SyncLog> {
    const log = await this.repo.create({
      direction: SyncDirection.INBOUND,
      status: SyncStatus.RUNNING,
      startedAt: new Date(),
      expiresAt: syncLogExpiresAt(),
    });

    try {
      const { items, skipped } = uniqueByCode(await this.adapter.fetchInventory());
      if (skipped.length > 0) {
        this.logger.warn(
          `Inbound sync: ${skipped.length} artículo(s) de Profit Plus omitidos por código vacío o repetido: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}`,
        );
      }
      // The SKU is Profit's reference, which Profit doesn't force to be
      // unique: two articles with the same one look alike on the web and to
      // the seller's scanner. They're still synced; this says which.
      const repeatedSkus = repeatedValues(items.map((item) => item.sku));
      if (repeatedSkus.length > 0) {
        this.logger.warn(
          `Inbound sync: referencias repetidas en Profit Plus (la web les muestra el mismo código): ${repeatedSkus.slice(0, 10).join(', ')}${repeatedSkus.length > 10 ? '…' : ''}`,
        );
      }

      // Matched in memory against the catalog snapshot (about one read for
      // the whole run) instead of querying Firestore per item.
      const { byErpExternalId, bySku } = await this.productsService.findAllForErpMatching();
      const catalogChanges: ErpCatalogChanges = { put: [], merge: [], remove: [] };

      // Resolve each distinct category exactly once — by Profit's category
      // code when the bridge sends it, else by name. Sharing the in-flight
      // promise across items of the same category avoids both N sequential
      // reads AND a race where two concurrent lookups for a new category
      // both pass the "not found" check and create duplicate category docs.
      const categoryByKey = new Map<string, ReturnType<CategoriesService['findOrCreateForErp']>>();
      const resolveCategory = (item: ErpInventoryItem) => {
        const key = item.categoryExternalId
          ? `erp:${item.categoryExternalId}`
          : `code:${item.categoryCode}`;
        const existing = categoryByKey.get(key);
        if (existing) return existing;
        const pending = this.categoriesService.findOrCreateForErp(
          item.categoryExternalId,
          item.categoryLabel,
        );
        categoryByKey.set(key, pending);
        return pending;
      };

      // Each brand is also a supplier: its products are assigned to it, for
      // purchase orders. Resolved once per brand, like categories. A failure
      // here only leaves the supplier as it was — prices and stock still
      // update.
      const supplierByKey = new Map<string, Promise<string | undefined>>();
      const resolveSupplier = (item: ErpInventoryItem): Promise<string | undefined> => {
        const brand = item.brand;
        if (!brand) return Promise.resolve(undefined);
        const key = item.brandExternalId ? `erp:${item.brandExternalId}` : `name:${brand}`;
        let pending = supplierByKey.get(key);
        if (!pending) {
          pending = this.financeService
            .findOrCreateForErpBrand(item.brandExternalId, brand)
            .then((supplier) => supplier.id)
            .catch((error: Error) => {
              this.logger.warn(
                `Inbound sync: no se pudo asignar el proveedor de la marca ${brand}: ${error.message}`,
              );
              return undefined;
            });
          supplierByKey.set(key, pending);
        }
        return pending;
      };

      const results = await Promise.allSettled(
        items.map(async (item) => {
          const [category, supplierId] = await Promise.all([
            resolveCategory(item),
            resolveSupplier(item),
          ]);
          const existing = byErpExternalId.get(item.externalId) ?? bySku.get(item.sku);
          return this.productsService.upsertFromErp(
            {
              externalId: item.externalId,
              sku: item.sku,
              name: item.name,
              categoryId: category.id,
              category: { id: category.id, code: category.code, label: category.label },
              retailPrice: item.retailPrice,
              wholesalePrice: item.wholesalePrice,
              cost: item.cost,
              stock: item.stock,
              specs: item.specs,
              brand: item.brand,
              supplierId,
            },
            existing,
            catalogChanges,
          );
        }),
      );
      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<{ product: Product; wrote: boolean }> =>
          r.status === 'fulfilled',
      );

      // Products that came from Profit Plus and weren't in this feed were
      // deleted or deactivated there: take them off the store. A run where
      // an item failed to save is skipped, so its product isn't mistaken for
      // a missing one.
      const seen = new Set(fulfilled.map((r) => r.value.product.id));
      const fromErp = [...byErpExternalId.values()];
      const missing = fromErp.filter((p) => !seen.has(p.id) && p.active && !p.erpRemovedAt);
      let hidden = 0;
      const allSaved = fulfilled.length === items.length;
      if (
        missing.length > 0 &&
        allSaved &&
        removalAllowed(missing.length, fromErp.length, items.length)
      ) {
        hidden = await this.productsService.hideRemovedFromErp(missing, catalogChanges);
      } else if (missing.length > 0) {
        const message = allSaved
          ? `${missing.length} productos ya no vienen de Profit Plus (el bridge envió ${items.length}) — demasiados para una sola corrida, no se oculta ninguno. Revisa el bridge.`
          : `${missing.length} productos no vinieron en esta corrida, pero algunos artículos fallaron al guardarse — no se oculta ninguno hasta una corrida completa.`;
        this.logger.warn(`Inbound sync: ${message}`);
        this.events.emit(ERP_SYNC_ERROR_EVENT, {
          direction: SyncDirection.INBOUND,
          message,
        } satisfies ErpSyncErrorEvent);
      }

      // One snapshot update for the whole run, not one per product.
      await this.productsService.applyCatalogChanges(catalogChanges);

      const processed = fulfilled.length;
      const written = fulfilled.filter((r) => r.value.wrote).length;
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length > 0) {
        this.logger.error(
          `Inbound sync: ${failed.length}/${items.length} item(s) failed`,
          failed[0].reason as Error,
        );
      }
      this.logger.log(
        `Inbound sync: ${processed}/${items.length} matched, ${written} written, ${processed - written} unchanged (skipped), ${hidden} hidden (no longer in Profit Plus)`,
      );

      const finished: Partial<SyncLog> = {
        status: SyncStatus.SUCCESS,
        itemsProcessed: processed,
        itemsHidden: hidden,
        ...(skipped.length > 0 && { itemsSkipped: skipped.length }),
        finishedAt: new Date(),
      };
      await this.repo.patch(log.id, finished);
      return { ...log, ...finished };
    } catch (error) {
      const message = (error as Error).message;
      await this.repo.patch(log.id, {
        status: SyncStatus.ERROR,
        error: message,
        finishedAt: new Date(),
      });
      // A bridge that isn't configured yet is a known state, not an
      // incident — notifying every admin on each cron tick would bury the
      // real sync errors under dozens of identical ones a day.
      if (!(error instanceof ErpNotConfiguredError)) {
        this.events.emit(ERP_SYNC_ERROR_EVENT, {
          direction: SyncDirection.INBOUND,
          message,
        } satisfies ErpSyncErrorEvent);
      }
      throw error;
    }
  }

  async getStatus(): Promise<{
    lastInbound: SyncLog | null;
    lastOutbound: SyncLog | null;
    adapterHealthy: boolean;
  }> {
    const [lastInbound, lastOutbound, adapterHealthy] = await Promise.all([
      this.repo.findOne([{ field: 'direction', op: '==', value: SyncDirection.INBOUND }], {
        field: 'startedAt',
        direction: 'desc',
      }),
      this.repo.findOne([{ field: 'direction', op: '==', value: SyncDirection.OUTBOUND }], {
        field: 'startedAt',
        direction: 'desc',
      }),
      this.adapter.healthCheck(),
    ]);
    return { lastInbound, lastOutbound, adapterHealthy };
  }

  async getLogs(): Promise<SyncLog[]> {
    return this.repo.findAll({ orderBy: { field: 'startedAt', direction: 'desc' }, limit: 5 });
  }
}
