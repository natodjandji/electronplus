import { FakeFirestore } from '../../test/fake-firestore';
import { Product } from '../products/entities/product.entity';
import { MercasistError } from './mercasist.client';
import { MERCASIST_SALE_EVENT, MercasistSyncService } from './mercasist-sync.service';
import { order, product, publication } from './mercasist-test-data';
import { MercasistOrder, MercasistPublication } from './mercasist.types';

function setup(
  data: {
    products?: Product[];
    active?: MercasistPublication[];
    paused?: MercasistPublication[];
    orders?: MercasistOrder[];
    settings?: Record<string, unknown>;
    quota?: { remainingDay: number; at: string };
  } = {},
) {
  const firestore = new FakeFirestore();
  if (data.settings) firestore.seed('settings', 'mercasist', data.settings);
  const client = {
    quota: () => data.quota,
    sleep: jest.fn().mockResolvedValue(undefined),
    patch: jest.fn().mockResolvedValue({ data: { id: 1, actualizado: ['precio'] } }),
    listAll: jest.fn(async (path: string, query: Record<string, string>) => {
      if (path === '/ordenes') return data.orders ?? [];
      return query.status === 'Activo' ? (data.active ?? []) : (data.paused ?? []);
    }),
  };
  const events = { emit: jest.fn() };
  const service = new MercasistSyncService(
    firestore as never,
    client as never,
    { allForMarketplace: async () => data.products ?? [product()] } as never,
    events as never,
  );
  return { firestore, client, events, service };
}

const settingsOf = (firestore: FakeFirestore) =>
  firestore.read('settings', 'mercasist') as Record<string, any>;

describe('MercasistSyncService', () => {
  beforeAll(() =>
    jest.useFakeTimers({ now: new Date('2026-10-20T18:00:00Z'), doNotFake: ['setTimeout'] }),
  );
  afterAll(() => jest.useRealTimers());

  it('previews what would change without touching Mercasist', async () => {
    const { client, firestore, service } = setup({
      products: [product({ retailPrice: 12, stock: 7 })],
      active: [publication()],
    });
    const result = await service.run({ dryRun: true });
    expect(client.patch).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({ publications: 1, matched: 1, deferred: 1 });
    expect(result.changes).toEqual([
      expect.objectContaining({
        sku: 'E27-9W',
        body: { precio: 13.92, moneda: 'USD', disponibilidad: 7 },
        current: { price: 11.6, currency: 'U$S', stock: 12, status: 'Activo' },
      }),
    ]);
    // The panel's list is kept, but no sync state.
    expect(firestore.read('snapshots', 'mercasist-publications')).toMatchObject({
      rows: [{ id: 501 }],
    });
    expect(settingsOf(firestore)).toBeUndefined();
  });

  it("sends each change, spaced under Mercasist's edit limit, and records the run", async () => {
    const { client, firestore, service } = setup({
      products: [product({ stock: 0 }), product({ id: 'p2', sku: 'B', active: false })],
      active: [publication(), publication({ id: 502, sku: 'B' })],
    });
    const { summary } = await service.run();
    expect(client.patch.mock.calls).toEqual([
      ['/publicaciones/501', { disponibilidad: 0 }],
      ['/publicaciones/502', { status: 'Pausado' }],
    ]);
    expect(client.sleep).toHaveBeenCalledTimes(1);
    expect(client.sleep).toHaveBeenCalledWith(1100);
    expect(summary).toMatchObject({ updated: 1, paused: 1, failed: 0, deferred: 0 });
    const settings = settingsOf(firestore);
    expect(settings.pausedBySync.sort()).toEqual([501, 502]);
    expect(settings.lastSync).toMatchObject({
      updated: 1,
      paused: 1,
      at: '2026-10-20T18:00:00.000Z',
    });
    const rows = (firestore.read('snapshots', 'mercasist-publications') as any).rows;
    expect(rows.map((r: any) => [r.id, r.stock, r.status])).toEqual([
      [501, 0, 'Activo'],
      [502, 12, 'Pausado'],
    ]);
  });

  it("keeps going past a refusal, and doesn't count a pause that failed", async () => {
    const { client, firestore, service } = setup({
      products: [product({ active: false }), product({ id: 'p2', sku: 'B', stock: 3 })],
      active: [publication(), publication({ id: 502, sku: 'B' })],
    });
    client.patch
      .mockRejectedValueOnce(new MercasistError(400, 'Mercasist: No se puede modificar'))
      .mockResolvedValueOnce({ data: { errores: ['Error al actualizar en MercadoLibre'] } });
    const { summary } = await service.run();
    expect(summary).toMatchObject({ failed: 2, paused: 0, updated: 0 });
    expect(summary.errors).toEqual([
      { sku: 'E27-9W', message: 'Mercasist: No se puede modificar' },
      { sku: 'B', message: 'Error al actualizar en MercadoLibre' },
    ]);
    expect(settingsOf(firestore).pausedBySync).toEqual([]);
  });

  it('stops at a rate limit and leaves the rest for the next run', async () => {
    const { client, service } = setup({
      products: [product({ stock: 1 }), product({ id: 'p2', sku: 'B', stock: 2 })],
      active: [publication(), publication({ id: 502, sku: 'B' })],
    });
    client.patch.mockRejectedValueOnce(new MercasistError(429, 'Límite diario'));
    const { summary } = await service.run();
    expect(client.patch).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ failed: 1, deferred: 1 });
  });

  it('caps the edits per run', async () => {
    const products = Array.from({ length: 105 }, (_, i) =>
      product({ id: `p${i}`, sku: `S${i}`, stock: 1 }),
    );
    const active = products.map((p, i) => publication({ id: 1000 + i, sku: p.sku }));
    const { client, service } = setup({ products, active });
    const { summary } = await service.run();
    expect(client.patch).toHaveBeenCalledTimes(100);
    expect(summary).toMatchObject({ updated: 100, deferred: 5 });
  });

  it("waits for tomorrow when today's quota is nearly spent", async () => {
    const { client, service } = setup({
      quota: { remainingDay: 50, at: '2026-10-20T15:00:00Z' },
    });
    const result = await service.run();
    expect(result.skipped).toContain('50');
    expect(client.listAll).not.toHaveBeenCalled();
  });

  it('holds open sales back from the stock', async () => {
    const { client, service } = setup({ active: [publication()], orders: [order()] });
    await service.run();
    expect(client.patch).toHaveBeenCalledWith('/publicaciones/501', { disponibilidad: 10 });
  });

  describe('sales', () => {
    it('starts counting on the first run without emailing what was already there', async () => {
      const { events, firestore, service } = setup({ active: [publication()], orders: [order()] });
      expect((await service.run()).summary.newSales).toBe(0);
      expect(events.emit).not.toHaveBeenCalled();
      expect(settingsOf(firestore).ordersBaselineAt).toBe('2026-10-20T18:00:00.000Z');
    });

    it('emails each new sale once', async () => {
      const recent = order({ fecha: '2026-10-20 13:30:00' }); // 17:30 UTC
      const { events, firestore, service } = setup({
        settings: { ordersBaselineAt: '2026-10-20T17:00:00.000Z' },
        orders: [recent, order({ id: 1, fecha: '2026-10-20 12:00:00' })],
      });
      expect((await service.run()).summary.newSales).toBe(1);
      expect(events.emit).toHaveBeenCalledWith(MERCASIST_SALE_EVENT, {
        id: '9001',
        idMl: '2000112345',
        status: 'Abierta',
        date: '2026-10-20T17:30:00.000Z',
        total: 23.2,
        currency: 'USD',
        buyer: 'COMPRADOR123',
        items: [{ title: 'Bombillo LED 9W E27', sku: 'E27-9W', qty: 2, unitPrice: 11.6 }],
      });
      expect(firestore.read('mercasistSales', '9001')).toMatchObject({ status: 'Abierta' });

      expect((await service.run()).summary.newSales).toBe(0);
      expect(events.emit).toHaveBeenCalledTimes(1);
    });
  });
});
