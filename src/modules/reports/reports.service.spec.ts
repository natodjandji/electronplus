import { Collections } from '../../firebase/firestore-collections';
import { ReportsService } from './reports.service';

/** Just enough of Firestore for the reports: chainable queries that count
 * their reads, and doc writes that count themselves. */
function stubFirestore(rows: {
  orders?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
  summaries?: Record<string, unknown>[];
}) {
  const reads: Record<string, number> = {};
  const wheres: unknown[][] = [];
  let writes = 0;
  const query = (name: string, data: Record<string, unknown>[] = []) => {
    const q = {
      where: (...clause: unknown[]) => {
        wheres.push([name, ...clause]);
        return q;
      },
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        reads[name] = (reads[name] ?? 0) + 1;
        return {
          size: data.length,
          docs: data.map((d, i) => ({ id: `${name}-${i}`, data: () => d })),
        };
      },
    };
    return q;
  };
  const firestore = {
    collection: (name: string) => ({
      ...query(name, name === Collections.ORDERS ? rows.orders : rows.summaries),
      doc: () => ({
        set: async () => {
          writes++;
        },
      }),
    }),
    collectionGroup: (name: string) => query(name, rows.payments),
  };
  return { firestore, reads, wheres, writes: () => writes };
}

const order = (category: string, total: number) => ({
  totalAmount: total,
  items: [
    {
      productId: category,
      sku: category,
      name: category,
      categoryLabel: category,
      qty: 1,
      unitPrice: total,
      unitCost: 1,
      lineTotal: total,
    },
  ],
});

describe('ReportsService', () => {
  it('counts pickup orders waiting to be collected as sales', async () => {
    const stub = stubFirestore({ orders: [] });
    await new ReportsService(stub.firestore as never).rollupDay(new Date('2026-10-10T15:00:00Z'));
    const statuses = stub.wheres.find((w) => w[1] === 'status')?.[3] as string[];
    expect(statuses).toContain('ready_for_pickup');
  });

  it('adds no margin for a sale whose product had no cost', async () => {
    const noCost = order('Cables', 30);
    delete (noCost.items[0] as { unitCost?: number }).unitCost;
    const stub = stubFirestore({ orders: [noCost, order('Breakers', 10)] });
    const profit = await new ReportsService(stub.firestore as never).profitability(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(profit.find((p) => p.productId === 'Cables')).toMatchObject({ revenue: 30, margin: 0 });
    expect(profit.find((p) => p.productId === 'Breakers')).toMatchObject({ margin: 9 });
  });

  it('reads a range of orders once for the reports the dashboard asks for together', async () => {
    const stub = stubFirestore({ orders: [order('Cables', 30), order('Breakers', 10)] });
    const reports = new ReportsService(stub.firestore as never);
    const from = new Date('2026-09-12T00:00:00Z');
    const to = new Date('2026-10-12T00:01:00Z');

    const [share, profit] = await Promise.all([
      reports.categoryShare(from, to),
      reports.profitability(from, to),
    ]);
    expect(share).toEqual([
      { name: 'Cables', value: 75 },
      { name: 'Breakers', value: 25 },
    ]);
    expect(profit).toHaveLength(2);
    expect(stub.reads[Collections.ORDERS]).toBe(1);

    // A different range is its own read.
    await reports.categoryShare(from, new Date('2026-10-12T00:02:00Z'));
    expect(stub.reads[Collections.ORDERS]).toBe(2);
  });

  it('builds the chart from the window summaries plus today, writing nothing', async () => {
    const stub = stubFirestore({
      summaries: [
        { date: '2026-09-03', salesTotal: 100, purchasesTotal: 40, ordersCount: 2 },
        { date: '2026-09-20', salesTotal: 50, purchasesTotal: 0, ordersCount: 1 },
      ],
      orders: [order('Cables', 25)],
      payments: [{ amount: 5 }],
    });
    const reports = new ReportsService(stub.firestore as never);

    const series = await reports.salesSeries();
    expect(series.find((p) => p.month === '2026-09')).toEqual({
      month: '2026-09',
      ventas: 150,
      compras: 40,
    });
    const thisMonth = new Date().toISOString().slice(0, 7);
    expect(series.find((p) => p.month === thisMonth)).toMatchObject({ ventas: 25, compras: 5 });
    expect(stub.writes()).toBe(0);
    // Only the chart's months are asked for, not every summary stored.
    expect(stub.wheres.filter(([name]) => name === Collections.SALES_DAILY_SUMMARIES)).toEqual([
      [Collections.SALES_DAILY_SUMMARIES, 'date', '>=', expect.any(String)],
      [Collections.SALES_DAILY_SUMMARIES, 'date', '<', expect.any(String)],
    ]);

    // Past days stay in memory for the day; today is live each time.
    await reports.salesSeries();
    expect(stub.reads[Collections.SALES_DAILY_SUMMARIES]).toBe(1);
    expect(stub.reads[Collections.ORDERS]).toBe(2);
  });

  it('stores a daily rollup with a single write and no read of the old one', async () => {
    const stub = stubFirestore({ orders: [order('Cables', 25)], payments: [] });
    const reports = new ReportsService(stub.firestore as never);
    const totals = await reports.rollupDay(new Date('2026-10-11T12:00:00Z'));
    expect(totals).toMatchObject({ salesTotal: 25, purchasesTotal: 0, ordersCount: 1 });
    expect(stub.writes()).toBe(1);
    expect(stub.reads[Collections.SALES_DAILY_SUMMARIES]).toBeUndefined();
  });
});
