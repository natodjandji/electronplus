import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { OrderStatus } from '../orders/entities/order.entity';
import { SalesDailySummary } from './entities/sales-daily-summary.entity';
import { addDays, addMonths, storeDay, storeDayStart } from '../../common/utils/store-day';

const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.FULFILLED,
];

/** How long reports over the same range share one read of its orders. */
const REVENUE_CACHE_MS = 60 * 1000;

type DayTotals = Pick<SalesDailySummary, 'date' | 'salesTotal' | 'purchasesTotal' | 'ordersCount'>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly summariesRepo: FirestoreRepository<SalesDailySummary>;
  private pastSummariesCache: { key: string; days: Promise<DayTotals[]> } | null = null;
  private readonly revenueCache = new Map<
    string,
    { at: number; orders: Promise<FirebaseFirestore.DocumentData[]> }
  >();

  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {
    this.summariesRepo = new FirestoreRepository<SalesDailySummary>(
      firestore,
      Collections.SALES_DAILY_SUMMARIES,
    );
  }

  /**
   * Nightly rollup of the previous day's sales (paid orders) and purchases
   * (supplier payments). @nestjs/schedule hands this straight to `cron` as a
   * bare onTick callback with nothing awaiting or catching its promise — an
   * uncaught rejection here would be an unhandled promise rejection that
   * crashes the whole process at 1am. Unlike `rollupDay` (also called
   * directly from salesSeries(), where letting an error surface to that
   * HTTP request is correct), this entry point has no caller to catch it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async rollupYesterday(): Promise<DayTotals | undefined> {
    try {
      return await this.rollupDay(storeDayStart(addDays(storeDay(), -1)));
    } catch (error) {
      this.logger.error('rollupYesterday cron run failed', error as Error);
      return undefined;
    }
  }

  /** Recomputes a day's totals and stores them as its summary — one set,
   * overwriting whatever the day had, without reading it first. */
  async rollupDay(date: Date): Promise<DayTotals> {
    const totals = await this.dayTotals(date);
    const now = FieldValue.serverTimestamp();
    await this.summariesRepo.doc(totals.date).set({ ...totals, createdAt: now, updatedAt: now });
    return totals;
  }

  /** A day's sales (paid orders) and purchases (supplier payments), read
   * live and not stored. The day is the store's (Venezuela), not UTC's: a
   * sale at 9 p.m. belongs to that day, not the next one. */
  private async dayTotals(date: Date): Promise<DayTotals> {
    const day = storeDay(date);
    const dayStart = storeDayStart(day);
    const dayEnd = storeDayStart(addDays(day, 1));

    const [ordersSnap, paymentsSnap] = await Promise.all([
      this.firestore
        .collection(Collections.ORDERS)
        .where('status', 'in', REVENUE_STATUSES)
        .where('createdAt', '>=', Timestamp.fromDate(dayStart))
        .where('createdAt', '<', Timestamp.fromDate(dayEnd))
        .get(),
      this.firestore
        .collectionGroup(Collections.SUPPLIER_PAYMENTS)
        .where('paidAt', '>=', Timestamp.fromDate(dayStart))
        .where('paidAt', '<', Timestamp.fromDate(dayEnd))
        .get(),
    ]);
    return {
      date: day,
      salesTotal: ordersSnap.docs.reduce((sum, d) => sum + (d.data().totalAmount as number), 0),
      purchasesTotal: paymentsSnap.docs.reduce((sum, d) => sum + (d.data().amount as number), 0),
      ordersCount: ordersSnap.size,
    };
  }

  /**
   * Monthly ventas/compras for the dashboard chart. Past days come from the
   * nightly summaries — only the chart's months, not every summary ever
   * stored, and kept in memory for the day since they only change with the
   * rollup. Today is added live, without writing anything: opening the
   * dashboard used to store today's summary on every view.
   */
  async salesSeries(months = 7): Promise<{ month: string; ventas: number; compras: number }[]> {
    const today = new Date();
    const todayIso = storeDay(today);
    const fromIso = addMonths(`${todayIso.slice(0, 7)}-01`, -(months - 1));

    const [past, live] = await Promise.all([
      this.pastSummaries(fromIso, todayIso),
      this.dayTotals(today),
    ]);

    const byMonth = new Map<string, { ventas: number; compras: number }>();
    for (const day of [...past, live]) {
      const key = day.date.slice(0, 7); // YYYY-MM
      const bucket = byMonth.get(key) ?? { ventas: 0, compras: 0 };
      bucket.ventas += day.salesTotal;
      bucket.compras += day.purchasesTotal;
      byMonth.set(key, bucket);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-months)
      .map(([month, totals]) => ({ month, ...totals }));
  }

  /** Summaries from `fromIso` up to (not including) `toIso`, cached until
   * either bound moves — i.e. until the next day. */
  private pastSummaries(fromIso: string, toIso: string): Promise<DayTotals[]> {
    const key = `${fromIso}|${toIso}`;
    if (this.pastSummariesCache?.key !== key) {
      const days = this.summariesRepo
        .findAll({
          where: [
            { field: 'date', op: '>=', value: fromIso },
            { field: 'date', op: '<', value: toIso },
          ],
          orderBy: { field: 'date' },
        })
        .then((rows) => rows as DayTotals[]);
      this.pastSummariesCache = { key, days };
      days.catch(() => (this.pastSummariesCache = null));
    }
    return this.pastSummariesCache!.days;
  }

  /** Paid-or-later orders created in [from, to]. The dashboard asks for
   * the category share and the profitability of the same range at once;
   * each used to read every order in it. Within REVENUE_CACHE_MS they share
   * one read (the controller rounds its default range to the minute). */
  private revenueOrders(from: Date, to: Date): Promise<FirebaseFirestore.DocumentData[]> {
    const now = Date.now();
    for (const [k, entry] of this.revenueCache) {
      if (now - entry.at >= REVENUE_CACHE_MS) this.revenueCache.delete(k);
    }
    const key = `${from.getTime()}|${to.getTime()}`;
    const hit = this.revenueCache.get(key);
    if (hit) return hit.orders;
    const orders = this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(from))
      .where('createdAt', '<=', Timestamp.fromDate(to))
      .get()
      .then((snap) => snap.docs.map((d) => d.data()));
    this.revenueCache.set(key, { at: now, orders });
    orders.catch(() => this.revenueCache.delete(key));
    return orders;
  }

  /** Bounded by date like its cashFlow/profitability siblings — the controller
   * always resolves a range (defaulting to the last month), but this method
   * also defaults to the last 30 days on its own so calling it unbounded is
   * never possible even from a future caller that forgets to pass one. */
  async categoryShare(from?: Date, to?: Date): Promise<{ name: string; value: number }[]> {
    const rangeEnd = to ?? new Date();
    const rangeStart = from ?? new Date(new Date(rangeEnd).setDate(rangeEnd.getDate() - 30));

    const orders = await this.revenueOrders(rangeStart, rangeEnd);
    const totalsByCategory = new Map<string, number>();

    for (const order of orders) {
      const items = (order.items ?? []) as { categoryLabel: string; lineTotal: number }[];
      for (const item of items) {
        totalsByCategory.set(
          item.categoryLabel,
          (totalsByCategory.get(item.categoryLabel) ?? 0) + item.lineTotal,
        );
      }
    }

    const grandTotal = [...totalsByCategory.values()].reduce((sum, v) => sum + v, 0);
    if (grandTotal === 0) return [...totalsByCategory.keys()].map((name) => ({ name, value: 0 }));

    return [...totalsByCategory.entries()].map(([name, total]) => ({
      name,
      value: Math.round((total / grandTotal) * 1000) / 10,
    }));
  }

  async profitability(
    from: Date,
    to: Date,
  ): Promise<
    {
      productId: string;
      sku: string;
      name: string;
      unitsSold: number;
      revenue: number;
      margin: number;
    }[]
  > {
    const orders = await this.revenueOrders(from, to);

    const byProduct = new Map<
      string,
      { sku: string; name: string; unitsSold: number; revenue: number; margin: number }
    >();
    for (const order of orders) {
      const items = (order.items ?? []) as {
        productId: string;
        sku: string;
        name: string;
        qty: number;
        unitPrice: number;
        unitCost?: number;
        lineTotal: number;
      }[];
      for (const item of items) {
        const bucket = byProduct.get(item.productId) ?? {
          sku: item.sku,
          name: item.name,
          unitsSold: 0,
          revenue: 0,
          margin: 0,
        };
        bucket.unitsSold += item.qty;
        bucket.revenue += item.lineTotal;
        // Without a cost there's no known margin — counting the whole price
        // as margin inflated it for every product with no cost entered.
        if (item.unitCost !== undefined && item.unitCost !== null) {
          bucket.margin += (item.unitPrice - item.unitCost) * item.qty;
        }
        byProduct.set(item.productId, bucket);
      }
    }

    return [...byProduct.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.margin - a.margin);
  }
}
