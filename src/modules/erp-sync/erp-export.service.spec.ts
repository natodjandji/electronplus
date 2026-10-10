import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import {
  ERP_EXPORT_MAX_ATTEMPTS,
  ErpExportService,
  nextAttemptDelayMs,
} from './erp-export.service';
import { ERP_SYNC_ERROR_EVENT } from './sync.service';

describe('ErpExportService', () => {
  function build(
    order: Record<string, unknown> = {},
    reportSale = jest.fn().mockResolvedValue(undefined),
  ) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.ORDERS, 'o1', {
      status: 'paid',
      erpExportPending: true,
      items: [{ sku: 'A1', qty: 2, unitPrice: 5 }],
      totalAmount: 10,
      createdAt: new Date('2026-10-01T12:00:00Z'),
      ...order,
    });
    const events = { emit: jest.fn() };
    const service = new ErpExportService(
      { reportSale, isConfigured: () => true } as never,
      firestore as never,
      events as never,
    );
    const read = () => firestore.read(Collections.ORDERS, 'o1')!;
    return { service, reportSale, events, read, firestore };
  }

  it('reports a pending sale once and clears the flag', async () => {
    const { service, reportSale, read } = build();
    expect(await service.exportOrder('o1')).toBe('exported');
    expect(reportSale).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'o1',
        total: 10,
        items: [{ sku: 'A1', qty: 2, unitPrice: 5 }],
      }),
    );
    expect(read()).toMatchObject({ erpExportPending: false, erpExportClaimedUntil: null });
    expect(read().erpExportedAt).toBeInstanceOf(Date);

    // A second caller (listener and cron racing) finds nothing left to do.
    expect(await service.exportOrder('o1')).toBe('skipped');
    expect(reportSale).toHaveBeenCalledTimes(1);
  });

  it('leaves an order alone while another attempt holds it', async () => {
    const { service, reportSale } = build({ erpExportClaimedUntil: new Date(Date.now() + 60_000) });
    expect(await service.exportOrder('o1')).toBe('skipped');
    expect(reportSale).not.toHaveBeenCalled();
  });

  it('takes over an order whose claim lapsed (a stalled attempt)', async () => {
    const { service, reportSale } = build({ erpExportClaimedUntil: new Date(Date.now() - 1_000) });
    expect(await service.exportOrder('o1')).toBe('exported');
    expect(reportSale).toHaveBeenCalledTimes(1);
  });

  it('keeps a sale pending without an attempt while the bridge is not set up', async () => {
    const { service, reportSale, read, firestore } = build();
    const unconfigured = new ErpExportService(
      { reportSale, isConfigured: () => false } as never,
      firestore as never,
      { emit: jest.fn() } as never,
    );
    firestore.reads.length = 0;
    expect(await unconfigured.exportOrder('o1')).toBe('skipped');
    expect(await unconfigured.exportPending()).toEqual({ exported: 0, failed: 0, waiting: 0 });
    expect(firestore.reads).toEqual([]);
    expect(reportSale).not.toHaveBeenCalled();
    expect(read()).toMatchObject({ erpExportPending: true });
    expect(read().erpExportAttempts).toBeUndefined();

    // Once it is, the same sale goes out.
    expect(await service.exportOrder('o1')).toBe('exported');
  });

  it('ignores orders that are not pending', async () => {
    const { service, reportSale } = build({ erpExportPending: false });
    expect(await service.exportOrder('o1')).toBe('skipped');
    expect(reportSale).not.toHaveBeenCalled();
  });

  it('schedules a retry after a failure and raises the error event', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('bridge down'));
    const { service, events, read } = build({}, failing);
    const before = Date.now();
    expect(await service.exportOrder('o1')).toBe('failed');

    const order = read();
    expect(order).toMatchObject({
      erpExportPending: true,
      erpExportAttempts: 1,
      erpExportError: 'bridge down',
      erpExportClaimedUntil: null,
    });
    expect((order.erpExportNextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + nextAttemptDelayMs(1),
    );
    expect(events.emit).toHaveBeenCalledWith(
      ERP_SYNC_ERROR_EVENT,
      expect.objectContaining({ message: 'bridge down', reference: 'o1' }),
    );
  });

  it('gives up after the last attempt', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('bridge down'));
    const { service, read } = build({ erpExportAttempts: ERP_EXPORT_MAX_ATTEMPTS - 1 }, failing);
    expect(await service.exportOrder('o1')).toBe('failed');
    expect(read()).toMatchObject({
      erpExportPending: false,
      erpExportAttempts: ERP_EXPORT_MAX_ATTEMPTS,
      erpExportNextAttemptAt: null,
    });
  });

  it('retries only the pending sales whose wait is over', async () => {
    const { service, reportSale } = build({
      erpExportNextAttemptAt: new Date(Date.now() + 60_000),
    });
    expect(await service.exportPending()).toEqual({ exported: 0, failed: 0, waiting: 1 });
    expect(reportSale).not.toHaveBeenCalled();

    expect(await service.exportPending(new Date(Date.now() + 120_000))).toEqual({
      exported: 1,
      failed: 0,
      waiting: 0,
    });
  });

  it('still reaches a due sale when others are waiting', async () => {
    const { service, reportSale, firestore } = build({
      erpExportNextAttemptAt: new Date(Date.now() + 60_000),
    });
    firestore.seed(Collections.ORDERS, 'o2', {
      status: 'paid',
      erpExportPending: true,
      items: [],
      totalAmount: 1,
      createdAt: new Date(),
    });
    expect(await service.exportPending()).toEqual({ exported: 1, failed: 0, waiting: 1 });
    expect(reportSale).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o2' }));
  });

  it('waits 15, 30, 60 and 120 minutes between attempts', () => {
    expect([1, 2, 3, 4].map((n) => nextAttemptDelayMs(n) / 60_000)).toEqual([15, 30, 60, 120]);
  });
});
