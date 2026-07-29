import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { OrderStatus } from '../orders/entities/order.entity';
import { SalesDailySummary } from './entities/sales-daily-summary.entity';

const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.FULFILLED,
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly summariesRepo: FirestoreRepository<SalesDailySummary>;

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
  async rollupYesterday(): Promise<SalesDailySummary | undefined> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return await this.rollupDay(yesterday);
    } catch (error) {
      this.logger.error('rollupYesterday cron run failed', error as Error);
      return undefined;
    }
  }

  async rollupDay(date: Date): Promise<SalesDailySummary> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const isoDate = toIsoDate(dayStart);

    const ordersSnap = await this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(dayStart))
      .where('createdAt', '<', Timestamp.fromDate(dayEnd))
      .get();
    const salesTotal = ordersSnap.docs.reduce(
      (sum, d) => sum + (d.data().totalAmount as number),
      0,
    );

    const paymentsSnap = await this.firestore
      .collectionGroup(Collections.SUPPLIER_PAYMENTS)
      .where('paidAt', '>=', Timestamp.fromDate(dayStart))
      .where('paidAt', '<', Timestamp.fromDate(dayEnd))
      .get();
    const purchasesTotal = paymentsSnap.docs.reduce(
      (sum, d) => sum + (d.data().amount as number),
      0,
    );

    const existing = await this.summariesRepo.findById(isoDate);
    const patch = { date: isoDate, salesTotal, purchasesTotal, ordersCount: ordersSnap.size };
    return existing
      ? this.summariesRepo.update(isoDate, patch)
      : this.summariesRepo.create(patch, isoDate);
  }

  /** Monthly ventas/compras series for the dashboard chart; rolls up today live since it has no summary row yet. */
  async salesSeries(months = 7): Promise<{ month: string; ventas: number; compras: number }[]> {
    await this.rollupDay(new Date());

    const summaries = await this.summariesRepo.findAll({
      orderBy: { field: 'date', direction: 'asc' },
    });
    const byMonth = new Map<string, { ventas: number; compras: number }>();

    for (const s of summaries) {
      const key = s.date.slice(0, 7); // YYYY-MM
      const bucket = byMonth.get(key) ?? { ventas: 0, compras: 0 };
      bucket.ventas += s.salesTotal;
      bucket.compras += s.purchasesTotal;
      byMonth.set(key, bucket);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-months)
      .map(([month, totals]) => ({ month, ...totals }));
  }

  /** Bounded by date like its cashFlow/profitability siblings — the controller
   * always resolves a range (defaulting to the last month), but this method
   * also defaults to the last 30 days on its own so calling it unbounded is
   * never possible even from a future caller that forgets to pass one. */
  async categoryShare(from?: Date, to?: Date): Promise<{ name: string; value: number }[]> {
    const rangeEnd = to ?? new Date();
    const rangeStart = from ?? new Date(new Date(rangeEnd).setDate(rangeEnd.getDate() - 30));

    const ordersSnap = await this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(rangeStart))
      .where('createdAt', '<=', Timestamp.fromDate(rangeEnd))
      .get();
    const totalsByCategory = new Map<string, number>();

    for (const doc of ordersSnap.docs) {
      const items = (doc.data().items ?? []) as { categoryLabel: string; lineTotal: number }[];
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

  async cashFlow(from: Date, to: Date): Promise<{ sales: number; purchases: number; net: number }> {
    const ordersSnap = await this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(from))
      .where('createdAt', '<=', Timestamp.fromDate(to))
      .get();
    const sales = ordersSnap.docs.reduce((sum, d) => sum + (d.data().totalAmount as number), 0);

    const paymentsSnap = await this.firestore
      .collectionGroup(Collections.SUPPLIER_PAYMENTS)
      .where('paidAt', '>=', Timestamp.fromDate(from))
      .where('paidAt', '<=', Timestamp.fromDate(to))
      .get();
    const purchases = paymentsSnap.docs.reduce((sum, d) => sum + (d.data().amount as number), 0);

    return { sales, purchases, net: sales - purchases };
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
    const ordersSnap = await this.firestore
      .collection(Collections.ORDERS)
      .where('status', 'in', REVENUE_STATUSES)
      .where('createdAt', '>=', Timestamp.fromDate(from))
      .where('createdAt', '<=', Timestamp.fromDate(to))
      .get();

    const byProduct = new Map<
      string,
      { sku: string; name: string; unitsSold: number; revenue: number; margin: number }
    >();
    for (const doc of ordersSnap.docs) {
      const items = (doc.data().items ?? []) as {
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
        bucket.margin += (item.unitPrice - (item.unitCost ?? 0)) * item.qty;
        byProduct.set(item.productId, bucket);
      }
    }

    return [...byProduct.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.margin - a.margin);
  }
}
