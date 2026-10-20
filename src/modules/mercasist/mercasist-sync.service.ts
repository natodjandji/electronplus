import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { MercasistClient, MercasistError } from './mercasist.client';
import {
  ContentSeen,
  exportBlocker,
  heldUnits,
  normalizeSku,
  orderTime,
  PlanOp,
  planSync,
} from './mercasist-plan';
import {
  MercasistOrder,
  MercasistPublication,
  MercasistPublicationRow,
  MercasistSale,
  MercasistSettings,
  MercasistSyncSummary,
} from './mercasist.types';

export const MERCASIST_SETTINGS_DOC = 'mercasist';
export const MERCASIST_SNAPSHOT_DOC = 'mercasist-publications';
export const MERCASIST_CONTENT_DOC = 'mercasist-content';

/** A sale came in on Mercado Libre — the admins get an email. */
export const MERCASIST_SALE_EVENT = 'mercasist.sale';
export type MercasistSaleEvent = Omit<MercasistSale, 'createdAt' | 'updatedAt'>;

/** Products on the web are ready to go on Mercado Libre — the admins get
 * an email to upload them with the bulk publisher. */
export const MERCASIST_NEW_PRODUCTS_EVENT = 'mercasist.new-products';
export interface MercasistNewProductsEvent {
  /** Ready and not announced before. */
  fresh: { name: string; sku: string }[];
  /** All ready to publish, announced or not. */
  totalReady: number;
}

/** At most one "new products" email this often: while Profit loads a big
 * catalog over several syncs, the admins get one email, not one an hour. */
const NEW_PRODUCTS_NOTICE_EVERY_MS = 12 * 60 * 60 * 1000;
/** The fields whose refusal makes an edit count as failed (Mercasist's
 * names, as in its "actualizado"); a refused title or description doesn't. */
const STOCK_AND_PRICE_FIELDS = ['precio', 'disponibilidad', 'status'] as const;

/** Mercasist applies each publication edit on Mercado Libre right away and
 * allows 60 a minute; this keeps under that. */
const WRITE_SPACING_MS = 1_100;
/** Per run, so one stays well inside Cloud Scheduler's deadline (about two
 * minutes of edits); the rest goes on the next tick. */
const MAX_WRITES_PER_RUN = 100;
/** Below this many requests left today, a run waits for tomorrow's quota
 * rather than spend the last ones on reads. */
const MIN_DAILY_QUOTA = 200;
/** Listing pages: Mercasist's maximum for each. */
const PUBLICATIONS_PAGE = 25;
const ORDERS_PAGE = 20;
const MAX_ERRORS_KEPT = 15;
/** Plenty for the store's catalog, and well under Firestore's 1 MB a doc. */
const MAX_ROWS_KEPT = 3_000;
const GRPC_ALREADY_EXISTS = 6;

export interface MercasistPreviewChange {
  publicationId: number;
  sku: string;
  title: string;
  kind: PlanOp['kind'];
  body: PlanOp['body'];
  /** What Mercasist shows now; `currency` is its symbol ("U$S", "Bs"). */
  current: { price: number | null; currency?: string; stock: number | null; status: string };
}

export interface MercasistRunResult {
  summary: MercasistSyncSummary;
  /** In a preview: what a real run would send (the first 200). */
  changes?: MercasistPreviewChange[];
  skipped?: string;
}

/**
 * Keeps the store's Mercado Libre publications, managed in Mercasist, in
 * step with the web: price (retail with IVA, in dollars) and stock from
 * Profit through the web, matched by SKU. It also reads the open Mercado
 * Libre sales: their units stay off the publication until the sale is
 * invoiced in Profit, and each new one is emailed to the admins.
 *
 * Mercasist can't create publications through its API — those come from
 * its bulk publisher, with the Excel MercasistService builds.
 */
@Injectable()
export class MercasistSyncService {
  private readonly logger = new Logger(MercasistSyncService.name);
  private readonly settingsRef: DocumentReference;
  private readonly snapshotRef: DocumentReference;
  private readonly contentRef: DocumentReference;
  private running: Promise<MercasistRunResult> | null = null;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly client: MercasistClient,
    private readonly productsService: ProductsService,
    private readonly events: EventEmitter2,
  ) {
    this.settingsRef = firestore.collection(Collections.SETTINGS).doc(MERCASIST_SETTINGS_DOC);
    this.snapshotRef = firestore.collection(Collections.SNAPSHOTS).doc(MERCASIST_SNAPSHOT_DOC);
    this.contentRef = firestore.collection(Collections.SNAPSHOTS).doc(MERCASIST_CONTENT_DOC);
  }

  async readSettings(): Promise<MercasistSettings> {
    const data = (await this.settingsRef.get()).data() ?? {};
    return { ...data, id: MERCASIST_SETTINGS_DOC } as MercasistSettings;
  }

  async readSnapshot(): Promise<{ at?: string; rows: MercasistPublicationRow[] }> {
    const data = (await this.snapshotRef.get()).data() as
      { at?: string; rows?: MercasistPublicationRow[] } | undefined;
    return { at: data?.at, rows: data?.rows ?? [] };
  }

  /** One run at a time on this instance: the admin's button and the
   * scheduled tick share it. A preview never writes to Mercasist. */
  run(options: { dryRun?: boolean } = {}): Promise<MercasistRunResult> {
    if (this.running) return this.running;
    this.running = this.runOnce(Boolean(options.dryRun)).finally(() => (this.running = null));
    return this.running;
  }

  private async runOnce(dryRun: boolean): Promise<MercasistRunResult> {
    const quota = this.client.quota();
    if (
      quota?.remainingDay !== undefined &&
      quota.remainingDay < MIN_DAILY_QUOTA &&
      sameVenezuelanDay(new Date(quota.at), new Date())
    ) {
      return {
        summary: emptySummary(),
        skipped: `Quedan ${quota.remainingDay} solicitudes de Mercasist por hoy; se sigue mañana.`,
      };
    }

    const [settings, contentDoc, products, active, paused, orders] = await Promise.all([
      this.readSettings(),
      this.contentRef.get(),
      this.productsService.allForMarketplace(),
      this.listPublications('Activo'),
      this.listPublications('Pausado'),
      this.client.listAll<MercasistOrder>(
        '/ordenes',
        { tipo: 'ML', status: 'activas', sort: 'orden_desc' },
        ORDERS_PAGE,
      ),
    ]);
    const publications = [...active, ...paused];
    const now = new Date();
    const syncStock = settings.syncStock !== false;
    const plan = planSync({
      publications,
      products,
      held: syncStock ? heldUnits(orders, now) : new Map(),
      syncPrice: settings.syncPrice !== false,
      syncStock,
      safetyStock: settings.safetyStock ?? 0,
      pausedBySync: settings.pausedBySync ?? [],
      syncContent: settings.syncContent !== false,
      contentSeen: (contentDoc.data() as { seen?: ContentSeen } | undefined)?.seen ?? {},
    });
    const contentSeen = plan.contentSeen;
    const summary: MercasistSyncSummary = {
      ...emptySummary(),
      publications: plan.rows.length,
      matched: plan.rows.filter((r) => r.productId).length,
    };

    if (dryRun) {
      const byId = new Map(publications.map((p) => [p.id, p]));
      summary.deferred = plan.ops.length;
      await this.saveSnapshot(plan.rows, now);
      return {
        summary,
        changes: plan.ops.slice(0, 200).map((op) => {
          const pub = byId.get(op.publicationId)!;
          return {
            publicationId: op.publicationId,
            sku: op.sku,
            title: op.title,
            kind: op.kind,
            body: op.body,
            current: {
              price: pub.precio,
              ...(pub.moneda?.simbolo && { currency: pub.moneda.simbolo }),
              stock: pub.disponibilidad,
              status: pub.status,
            },
          };
        }),
      };
    }

    const pausedBySync = plan.pausedBySync;
    const previouslyPaused = new Set(settings.pausedBySync ?? []);
    const rowById = new Map(plan.rows.map((r) => [r.id, r]));
    const errors: { sku: string; message: string }[] = [];
    let stopped = false;

    try {
      for (const [i, op] of plan.ops.entries()) {
        if (stopped || i >= MAX_WRITES_PER_RUN) {
          summary.deferred++;
          undo(op, pausedBySync, previouslyPaused);
          continue;
        }
        if (i > 0) await this.client.sleep(WRITE_SPACING_MS);
        try {
          const result = await this.client.patch<{
            data?: { actualizado?: string[]; errores?: string[] };
          }>(`/publicaciones/${op.publicationId}`, op.body);
          const partial = result?.data?.errores?.filter(Boolean) ?? [];
          // Without its list of what changed, an answer with errors counts as
          // nothing done; a clean one as everything.
          const done = new Set(
            result?.data?.actualizado ?? (partial.length > 0 ? [] : Object.keys(op.body)),
          );
          // Mercasist answered: the name/description it got is recorded even
          // if Mercado Libre refused it (a title locks once an item sold),
          // so it isn't sent again on every run.
          if (op.content) recordContent(contentSeen, op);
          const missing = STOCK_AND_PRICE_FIELDS.filter((f) => f in op.body && !done.has(f));
          if (partial.length > 0 && missing.length > 0) {
            throw new MercasistError(207, partial.join('; '));
          }
          if (partial.length > 0 && errors.length < MAX_ERRORS_KEPT) {
            errors.push({ sku: op.sku, message: partial.join('; ') });
          }
          if (op.kind === 'pause') summary.paused++;
          else if (op.kind === 'activate') summary.activated++;
          else summary.updated++;
          applyToRow(rowById.get(op.publicationId), op, done);
        } catch (error) {
          summary.failed++;
          undo(op, pausedBySync, previouslyPaused);
          const message = error instanceof Error ? error.message : String(error);
          if (errors.length < MAX_ERRORS_KEPT) errors.push({ sku: op.sku, message });
          this.logger.warn(`Mercasist refused ${op.kind} for ${op.sku}: ${message}`);
          // Out of quota (a long wait): the rest goes on the next run.
          if (error instanceof MercasistError && error.status === 429) stopped = true;
        }
      }
      summary.newSales = await this.recordSales(orders, settings, now);
      summary.readyToPublish = await this.announceNewProducts(
        products,
        publications,
        settings,
        now,
      );
    } finally {
      if (errors.length > 0) summary.errors = errors;
      await Promise.all([
        this.settingsRef.set(
          {
            pausedBySync: [...pausedBySync],
            lastSync: { ...summary, at: now.toISOString() },
          },
          { merge: true },
        ),
        this.saveSnapshot(plan.rows, now),
        this.contentRef.set({ seen: contentSeen }),
      ]);
    }
    this.logger.log(
      `Mercasist: ${summary.updated} actualizadas, ${summary.paused} pausadas, ${summary.activated} reactivadas, ${summary.failed} con error, ${summary.deferred} para la próxima, ${summary.newSales} ventas nuevas`,
    );
    return { summary };
  }

  /**
   * Products ready to go on Mercado Libre (on sale, with a SKU, a photo and
   * stock) that no publication has yet: the admins get one email about
   * the ones not announced before, at most every 12 hours. Returns how
   * many are ready in all.
   */
  private async announceNewProducts(
    products: Product[],
    publications: MercasistPublication[],
    settings: MercasistSettings,
    now: Date,
  ): Promise<number> {
    const listed = new Set(publications.map((p) => normalizeSku(p.sku)).filter(Boolean));
    const safety = settings.safetyStock ?? 0;
    const ready = products.filter(
      (p) => !listed.has(normalizeSku(p.sku)) && !exportBlocker(p, safety),
    );
    const readyIds = new Set(ready.map((p) => p.id));
    const announced = (settings.announcedProducts ?? []).filter((id) => readyIds.has(id));
    const fresh = ready.filter((p) => !announced.includes(p.id));
    const lastNotice = settings.newProductsNoticeAt ? Date.parse(settings.newProductsNoticeAt) : 0;

    if (
      fresh.length > 0 &&
      settings.notifyNewProducts !== false &&
      now.getTime() - lastNotice >= NEW_PRODUCTS_NOTICE_EVERY_MS
    ) {
      const event: MercasistNewProductsEvent = {
        fresh: fresh.map((p) => ({ name: p.name, sku: p.sku })),
        totalReady: ready.length,
      };
      this.events.emit(MERCASIST_NEW_PRODUCTS_EVENT, event);
      await this.settingsRef.set(
        { announcedProducts: [...readyIds], newProductsNoticeAt: now.toISOString() },
        { merge: true },
      );
    } else {
      // Published (or no longer ready) ones drop out; the fresh wait.
      await this.settingsRef.set({ announcedProducts: announced }, { merge: true });
    }
    return ready.length;
  }

  private async listPublications(status: string): Promise<MercasistPublication[]> {
    return this.client.listAll<MercasistPublication>(
      '/publicaciones',
      { tipo: 'ML', status },
      PUBLICATIONS_PAGE,
    );
  }

  private saveSnapshot(rows: MercasistPublicationRow[], now: Date) {
    return this.snapshotRef.set({
      at: now.toISOString(),
      rows: rows.slice(0, MAX_ROWS_KEPT),
      ...(rows.length > MAX_ROWS_KEPT && { truncated: rows.length }),
    });
  }

  /**
   * Each open Mercado Libre sale is recorded once and emailed to the admins.
   * The first run only sets the starting point: sales already there when
   * the integration started aren't news. The doc's create() is what makes
   * it once, even with two instances running at the same time.
   */
  private async recordSales(
    orders: MercasistOrder[],
    settings: MercasistSettings,
    now: Date,
  ): Promise<number> {
    if (!settings.ordersBaselineAt) {
      await this.settingsRef.set({ ordersBaselineAt: now.toISOString() }, { merge: true });
      return 0;
    }
    const since = Date.parse(settings.ordersBaselineAt);
    let count = 0;
    for (const order of orders) {
      if (order.tipo !== 'ML' || !(orderTime(order.fecha) >= since)) continue;
      const sale = toSale(order);
      try {
        await this.firestore
          .collection(Collections.MERCASIST_SALES)
          .doc(sale.id)
          .create({ ...sale, createdAt: now, updatedAt: now });
      } catch (error) {
        if ((error as { code?: number }).code === GRPC_ALREADY_EXISTS) continue;
        throw error;
      }
      count++;
      this.events.emit(MERCASIST_SALE_EVENT, sale);
    }
    return count;
  }
}

export function emptySummary(): MercasistSyncSummary {
  return {
    publications: 0,
    matched: 0,
    updated: 0,
    paused: 0,
    activated: 0,
    failed: 0,
    deferred: 0,
    newSales: 0,
  };
}

/** An op that didn't go through leaves the paused list as it was. */
function undo(op: PlanOp, paused: Set<number>, before: Set<number>): void {
  if (op.kind === 'activate') paused.add(op.publicationId);
  else if (!before.has(op.publicationId)) paused.delete(op.publicationId);
}

function applyToRow(row: MercasistPublicationRow | undefined, op: PlanOp, done: Set<string>): void {
  if (!row) return;
  if (op.body.precio !== undefined && done.has('precio')) row.price = op.body.precio;
  if (op.body.disponibilidad !== undefined && done.has('disponibilidad')) {
    row.stock = op.body.disponibilidad;
  }
  if (op.body.status && done.has('status')) row.status = op.body.status;
  if (op.body.titulo && done.has('titulo')) row.title = op.body.titulo;
}

function recordContent(seen: ContentSeen, op: PlanOp): void {
  const entry = seen[op.publicationId];
  if (!entry || !op.content) return;
  seen[op.publicationId] = {
    t: op.content.t ?? entry.t,
    d: op.content.d ?? entry.d,
  };
}

/** Mercasist's currency symbol ("U$S", "Bs") as a code. */
function currencyCode(symbol: string): string {
  return /u\$s|us\$|usd|\$/i.test(symbol) && !/bs/i.test(symbol) ? 'USD' : 'VES';
}

function toSale(order: MercasistOrder): MercasistSaleEvent {
  const lines = order.articulos ?? [];
  const buyer = order.comprador?.nick || order.comprador?.nombre;
  return {
    id: String(order.id),
    idMl: order.id_ml,
    status: order.estatus,
    date: new Date(orderTime(order.fecha)).toISOString(),
    total: order.total ?? lines.reduce((sum, l) => sum + l.precio * l.cantidad, 0),
    currency: currencyCode(order.moneda ?? ''),
    ...(buyer && { buyer }),
    items: lines.map((l) => ({
      title: l.titulo,
      ...(l.sku && { sku: l.sku }),
      qty: l.cantidad,
      unitPrice: l.precio,
    })),
  };
}

/** Mercasist's daily quota restarts at midnight in Venezuela (UTC-4). */
function sameVenezuelanDay(a: Date, b: Date): boolean {
  const day = (d: Date) => new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return day(a) === day(b);
}
