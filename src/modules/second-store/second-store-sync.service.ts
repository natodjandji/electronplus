import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import type { Firestore } from 'firebase-admin/firestore';
import { EnvConfig } from '../../config/env.validation';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { SecondStoreProduct } from './entities/second-store-product.entity';
import {
  SecondStoreSyncLog,
  SecondStoreSyncStatus,
  secondStoreSyncLogExpiresAt,
} from './entities/second-store-sync-log.entity';

/**
 * Syncs the SECUNDARIA store's Profit Plus install into `secondStoreProducts`
 * — description+stock only, via profit-plus-bridge-secundaria. This is a
 * distinct system from the PRINCIPAL store's integration (SyncService,
 * ../erp-sync/sync.service.ts): different SQL Server, different bridge,
 * different field contract (no code — matches by name text, see
 * runInboundSync below), different Firestore collection (products, not
 * this one). Don't merge their config, cron, or logic — the two ERP
 * installs are unrelated beyond both being "Profit Plus". Unlike the
 * principal side there's no adapter/mock indirection here — no bridge
 * configured just means this cron skips its run and logs a warning.
 */
const SYNC_JOB_NAME = 'second-store-profit-inbound-sync';

interface BridgeProduct {
  descripcion: string;
  stock: number;
}

interface BridgeResponse {
  total: number;
  productos: BridgeProduct[];
}

export interface SecondStoreSyncResult {
  fromBridge: number;
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Pulls from profit-plus-bridge-secundaria/ (a separate bridge, separate
 * SQL Server, separate small standalone project — see its own README) and
 * keeps second_store_products in sync. Unlike the primary store's ERP sync
 * (erp-sync/sync.service.ts), that bridge only reports descripción+stock —
 * no code/SKU — so matching against an existing record is by exact `name`
 * text (case/whitespace-insensitive), not an external id. A description
 * with no matching record gets a brand-new SecondStoreProduct created,
 * unlinked — linking it to a catalog Product stays a deliberate admin
 * action via SecondStoreService.link(), same as for a manually-entered
 * record (see that entity's doc comment on why linking isn't automatic).
 *
 * Manual editing of `stock` (SecondStoreService.update()) stays available
 * once this sync is live, same as the primary store keeps its manual
 * adjustStock endpoint alongside its own ERP sync — whichever wrote last
 * wins, and the next scheduled sync will overwrite it again from Profit
 * Plus, same tradeoff already accepted for the primary catalog.
 */
@Injectable()
export class SecondStoreSyncService implements OnModuleInit {
  private readonly logger = new Logger(SecondStoreSyncService.name);
  private readonly repo: FirestoreRepository<SecondStoreProduct>;
  private readonly logsRepo: FirestoreRepository<SecondStoreSyncLog>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.repo = new FirestoreRepository<SecondStoreProduct>(
      firestore,
      Collections.SECOND_STORE_PRODUCTS,
    );
    this.logsRepo = new FirestoreRepository<SecondStoreSyncLog>(
      firestore,
      Collections.SECOND_STORE_SYNC_LOGS,
    );
  }

  onModuleInit(): void {
    const cronExpression = this.config.get('SECOND_STORE_SYNC_CRON', { infer: true });
    const job = new CronJob(cronExpression, () => {
      this.runInboundSync().catch((error) =>
        this.logger.error('Scheduled second-store inbound sync failed', error as Error),
      );
    });
    this.schedulerRegistry.addCronJob(SYNC_JOB_NAME, job);
    job.start();
  }

  async runInboundSync(): Promise<SecondStoreSyncResult> {
    const log = await this.logsRepo.create({
      status: SecondStoreSyncStatus.RUNNING,
      startedAt: new Date(),
      itemsProcessed: 0,
      expiresAt: secondStoreSyncLogExpiresAt(),
    });

    const url = this.config.get('SECOND_STORE_PROFIT_API_URL', { infer: true });
    const apiKey = this.config.get('SECOND_STORE_PROFIT_API_KEY', { infer: true });
    if (!url || !apiKey) {
      const message =
        'SECOND_STORE_PROFIT_API_URL/SECOND_STORE_PROFIT_API_KEY no configurados todavía — se salta este ciclo de sincronización.';
      this.logger.warn(message);
      await this.logsRepo.update(log.id, {
        status: SecondStoreSyncStatus.ERROR,
        error: message,
        finishedAt: new Date(),
      });
      return { fromBridge: 0, created: 0, updated: 0, unchanged: 0 };
    }

    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/productos-sincronizacion`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw new Error(
          `El bridge de la tienda secundaria respondió ${res.status}: ${await res.text()}`,
        );
      }
      const data = (await res.json()) as BridgeResponse;

      // Una sola lectura para toda la corrida — cada artículo del bridge se
      // resuelve en memoria contra este mapa en vez de una query por
      // artículo (mismo patrón ya usado en el sync de la tienda principal).
      const existing = await this.repo.findAll();
      const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));

      let created = 0;
      let updated = 0;
      for (const item of data.productos) {
        const key = item.descripcion.trim().toLowerCase();
        const match = byName.get(key);

        if (!match) {
          await this.repo.create({ name: item.descripcion, stock: item.stock });
          created++;
          continue;
        }
        // Dirty-check — no reescribe el documento si el stock no cambió.
        if (match.stock !== item.stock) {
          await this.repo.update(match.id, { stock: item.stock });
          updated++;
        }
      }

      const result: SecondStoreSyncResult = {
        fromBridge: data.productos.length,
        created,
        updated,
        unchanged: data.productos.length - created - updated,
      };
      this.logger.log(
        `Second-store sync: ${result.fromBridge} artículos del bridge, ${result.created} creados, ${result.updated} actualizados, ${result.unchanged} sin cambios.`,
      );
      await this.logsRepo.update(log.id, {
        status: SecondStoreSyncStatus.SUCCESS,
        itemsProcessed: result.fromBridge,
        finishedAt: new Date(),
      });
      return result;
    } catch (error) {
      await this.logsRepo.update(log.id, {
        status: SecondStoreSyncStatus.ERROR,
        error: (error as Error).message,
        finishedAt: new Date(),
      });
      throw error;
    }
  }

  /** The two Profit Plus servers live at different physical locations —
   * this store's bridge being reachable says nothing about the other
   * store's, so each gets its own independent health check rather than a
   * single combined "ERP connection" status. */
  async healthCheck(): Promise<boolean> {
    const url = this.config.get('SECOND_STORE_PROFIT_API_URL', { infer: true });
    if (!url) return false;
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<{
    lastInbound: SecondStoreSyncLog | null;
    adapterHealthy: boolean;
  }> {
    const [lastInbound, adapterHealthy] = await Promise.all([
      this.logsRepo.findOne([], { field: 'startedAt', direction: 'desc' }),
      this.healthCheck(),
    ]);
    return { lastInbound, adapterHealthy };
  }

  async getLogs(): Promise<SecondStoreSyncLog[]> {
    return this.logsRepo.findAll({ orderBy: { field: 'startedAt', direction: 'desc' }, limit: 50 });
  }
}
