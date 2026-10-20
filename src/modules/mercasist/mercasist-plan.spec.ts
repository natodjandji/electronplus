import {
  exportBlocker,
  exportRow,
  heldUnits,
  listingTitle,
  mercasistPrice,
  orderTime,
  planSync,
} from './mercasist-plan';
import { order, product, publication } from './mercasist-test-data';

const plan = (overrides: Partial<Parameters<typeof planSync>[0]> = {}) =>
  planSync({
    publications: [publication()],
    products: [product()],
    held: new Map(),
    syncPrice: true,
    syncStock: true,
    safetyStock: 0,
    pausedBySync: [],
    ...overrides,
  });

describe('Mercasist plan', () => {
  it('prices at retail with IVA, to the cent', () => {
    expect(mercasistPrice({ retailPrice: 10 })).toBe(11.6);
    expect(mercasistPrice({ retailPrice: 2.125 })).toBe(2.47);
  });

  it('sends nothing when the publication already matches the web', () => {
    const result = plan();
    expect(result.ops).toEqual([]);
    expect(result.rows[0]).toMatchObject({ id: 501, productId: 'p1', price: 11.6, stock: 12 });
  });

  it('sends only what changed: the price (in dollars) and the stock', () => {
    const result = plan({ products: [product({ retailPrice: 12, stock: 7 })] });
    expect(result.ops).toEqual([
      expect.objectContaining({
        publicationId: 501,
        kind: 'update',
        body: { precio: 13.92, moneda: 'USD', disponibilidad: 7 },
      }),
    ]);
  });

  it('moves a publication in bolívares to dollars even at the same number', () => {
    const result = plan({
      publications: [publication({ moneda: { nombre: 'Bolívar', simbolo: 'Bs' } })],
    });
    expect(result.ops[0].body).toEqual({ precio: 11.6, moneda: 'USD' });
  });

  it('matches SKUs ignoring case and spaces', () => {
    expect(plan({ publications: [publication({ sku: ' e27-9w ' })] }).rows[0].productId).toBe('p1');
  });

  it('keeps open sales and the safety stock off the publication', () => {
    const result = plan({ held: new Map([['E27-9W', 3]]), safetyStock: 2 });
    expect(result.ops[0].body).toEqual({ disponibilidad: 7 });
  });

  it('never goes below zero, and remembers a publication it emptied', () => {
    const result = plan({ products: [product({ stock: 1 })], safetyStock: 2 });
    expect(result.ops[0].body).toEqual({ disponibilidad: 0 });
    expect([...result.pausedBySync]).toEqual([501]);
  });

  it('pauses a publication whose product left the web, or lost its price', () => {
    for (const p of [
      product({ active: false }),
      product({ erpRemovedAt: new Date() }),
      product({ retailPrice: 0 }),
    ]) {
      const result = plan({ products: [p] });
      expect(result.ops).toEqual([
        expect.objectContaining({ kind: 'pause', body: { status: 'Pausado' } }),
      ]);
      expect(result.pausedBySync.has(501)).toBe(true);
    }
  });

  it('brings back only what it paused, once there is stock', () => {
    const paused = publication({ status: 'Pausado', disponibilidad: 0 });
    expect(plan({ publications: [paused], pausedBySync: [501] }).ops[0]).toMatchObject({
      kind: 'activate',
      body: { disponibilidad: 12, status: 'Activo' },
    });
    // Paused by Mercado Libre after selling out (it shows 0): back too.
    expect(plan({ publications: [paused] }).ops[0]).toMatchObject({ kind: 'activate' });
    // Paused by an admin (with stock): the stock is kept right, but it stays paused.
    const own = plan({ publications: [publication({ status: 'Pausado', disponibilidad: 4 })] });
    expect(own.ops[0]).toEqual(
      expect.objectContaining({ kind: 'update', body: { disponibilidad: 12 } }),
    );
  });

  it('forgets a paused publication that is active again, or gone', () => {
    expect(plan({ pausedBySync: [501] }).pausedBySync.size).toBe(0);
    expect(plan({ publications: [], pausedBySync: [777] }).pausedBySync.size).toBe(0);
  });

  it('leaves alone what it cannot match or handle', () => {
    const result = plan({
      publications: [
        publication({ id: 1, sku: 'OTRO' }),
        publication({ id: 2, sku: null }),
        publication({ id: 3, variaciones: [{ id: 9, sku: 'E27-9W', cantidad: 3 }] }),
        publication({ id: 4, tipo: 'ST' }),
      ],
      products: [product({ stock: 99 })],
    });
    expect(result.ops).toEqual([]);
    expect(result.rows.map((r) => r.note)).toEqual([
      'Ningún producto de la web tiene este SKU',
      'La publicación no tiene SKU',
      'Tiene variaciones: se maneja en Mercasist',
    ]);
  });

  it('honours the price and stock switches', () => {
    const changed = { products: [product({ retailPrice: 12, stock: 7 })] };
    expect(plan({ ...changed, syncPrice: false }).ops[0].body).toEqual({ disponibilidad: 7 });
    expect(plan({ ...changed, syncStock: false }).ops[0].body).toEqual({
      precio: 13.92,
      moneda: 'USD',
    });
  });

  it('puts stock changes before price-only ones', () => {
    const result = plan({
      publications: [publication({ id: 1, sku: 'A' }), publication({ id: 2, sku: 'B' })],
      products: [
        product({ id: 'a', sku: 'A', retailPrice: 20 }),
        product({ id: 'b', sku: 'B', stock: 3 }),
      ],
    });
    expect(result.ops.map((op) => op.publicationId)).toEqual([2, 1]);
  });

  it('prefers the product on sale when two share a SKU', () => {
    const result = plan({
      products: [product({ id: 'old', active: false }), product({ id: 'new' })],
    });
    expect(result.rows[0].productId).toBe('new');
  });
});

describe('open Mercado Libre sales', () => {
  const now = new Date('2026-10-20T18:00:00Z');

  it('reads Mercasist dates as Venezuelan time', () => {
    expect(new Date(orderTime('2026-10-20 10:00:00')).toISOString()).toBe(
      '2026-10-20T14:00:00.000Z',
    );
  });

  it('holds back units from recent sales only', () => {
    const held = heldUnits(
      [
        order(),
        order({ id: 2, articulos: [{ titulo: 'x', sku: 'e27-9w', cantidad: 1, precio: 1 }] }),
        order({ id: 3, fecha: '2026-10-10 10:00:00' }),
        order({ id: 4, tipo: 'NML' }),
      ],
      now,
    );
    expect([...held]).toEqual([['E27-9W', 3]]);
  });
});

describe('bulk-publisher Excel', () => {
  it('only takes products that can be listed', () => {
    expect(exportBlocker(product(), 0)).toBeUndefined();
    expect(exportBlocker(product({ imageUrl: undefined }), 0)).toBe('Sin foto');
    expect(exportBlocker(product({ stock: 2 }), 2)).toBe('Sin stock');
    expect(exportBlocker(product({ sku: ' ' }), 0)).toBe('Sin SKU');
    expect(exportBlocker(product({ active: false }), 0)).toBe('Oculto en la web');
  });

  it('cuts titles to 60 characters at a word', () => {
    const long = 'Lámpara lineal LED de 60 cm 18W luz blanca para cocinas closets y talleres';
    const title = listingTitle(long);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(title)).toBe(true);
    expect(title).toBe('Lámpara lineal LED de 60 cm 18W luz blanca para cocinas');
    expect(
      listingTitle('Lámpara lineal LED 60 cm 18W luz blanca para cocinas, closets y talleres'),
    ).toBe('Lámpara lineal LED 60 cm 18W luz blanca para cocinas');
  });

  it('fills a row the way Mercasist names its fields', () => {
    expect(exportRow(product({ specs: 'Luz cálida, 800 lm' }), 'gold_special', 2)).toEqual([
      'Bombillo LED 9W E27',
      'Luz cálida, 800 lm',
      11.6,
      10,
      'nuevo',
      'https://storage.googleapis.com/x/e27.png',
      'gold_special',
      'USD',
      'E27-9W',
      'BRAND: Lucernario; MODEL: E27-9W',
    ]);
  });
});
