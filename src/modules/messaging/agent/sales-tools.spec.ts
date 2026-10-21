import type { Product } from '../../products/entities/product.entity';
import { cartUrl, formatRef, runSalesTool, type SalesToolDeps } from './sales-tools';

function product(id: string, name: string, retailPrice: number, stock: number): Product {
  return {
    id,
    sku: id,
    name,
    categoryId: 'c',
    category: { id: 'c', code: 'c', label: 'Iluminación' },
    retailPrice,
    wholesalePrice: retailPrice * 0.8,
    stock,
    active: true,
    imageUrl: `https://img/${id}.jpg`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function setup() {
  const catalog = [
    product('p1', 'Bombillo LED 9W', 2.5, 100),
    product('p2', 'Breaker 2x20A', 11.35, 3),
    product('p3', 'Tablero 4 circuitos', 30, 0),
  ];
  const sendProducts = jest.fn(async () => {});
  const handOver = jest.fn(async () => {});
  const deps: SalesToolDeps = {
    catalog: async () => catalog,
    paymentMethods: async () => [{ label: 'Pago móvil', details: ['Banesco', '0414-0000000'] }],
    bcvRate: async () => ({ rate: 200, date: '2026-10-20' }),
    shippingQuote: async (state) =>
      state === 'Miranda' ? { amount: 5, matched: true } : { amount: 0, matched: false },
    siteUrl: 'https://electronplus.com.ve/',
    sendProducts,
    handOver,
  };
  const run = async (name: string, input: unknown) => {
    const outcome = await runSalesTool(name, input, deps);
    return { ...outcome, data: outcome.isError ? null : JSON.parse(outcome.content) };
  };
  return { run, sendProducts, handOver };
}

describe('runSalesTool', () => {
  it('searches and reports prices and availability, not exact stock words', async () => {
    const { run } = setup();
    const { data } = await run('buscar_productos', { consulta: 'breaker 20a' });
    expect(data.resultados).toEqual([
      expect.objectContaining({
        id: 'p2',
        precio_ref: 11.35,
        disponibilidad: 'pocas unidades',
        unidades: 3,
      }),
    ]);
  });

  it('tells the model not to claim a product the search did not find', async () => {
    const { run } = setup();
    const { data } = await run('buscar_productos', { consulta: 'cable thhn' });
    expect(data.total).toBe(0);
    expect(data.nota).toMatch(/No digas que tenemos/);
  });

  it('sends the products it knows and reports the rest', async () => {
    const { run, sendProducts } = setup();
    const { data } = await run('enviar_productos', { ids: ['p1', 'nope', 'p1'] });
    expect(sendProducts).toHaveBeenCalledWith([expect.objectContaining({ id: 'p1' })]);
    expect(data).toEqual({ enviados: ['Bombillo LED 9W'], no_encontrados: ['nope'] });
  });

  it('refuses more cards than allowed', async () => {
    const { run, sendProducts } = setup();
    const outcome = await run('enviar_productos', { ids: ['1', '2', '3', '4', '5', '6'] });
    expect(outcome.isError).toBe(true);
    expect(sendProducts).not.toHaveBeenCalled();
  });

  it('builds the cart link with IVA and Bs, capping to stock and skipping sold-out items', async () => {
    const { run } = setup();
    const { data } = await run('crear_enlace_carrito', {
      productos: [
        { id: 'p1', cantidad: 4 },
        { id: 'p2', cantidad: 5 },
        { id: 'p3', cantidad: 1 },
      ],
    });
    expect(data.enlace).toBe('https://electronplus.com.ve/cart?agregar=p1:4,p2:3');
    expect(data.subtotal_ref).toBe(44.05);
    expect(data.iva_ref).toBe(7.05);
    expect(data.total_ref).toBe(51.1);
    expect(data.total_bs).toBe(10220);
    expect(data.advertencias).toEqual([
      'Breaker 2x20A: solo hay 3, se agregaron 3.',
      'Tablero 4 circuitos está agotado; no se agregó.',
    ]);
  });

  it('gives payment methods, the BCV rate and shipping when the zone has a rate', async () => {
    const { run } = setup();
    const { data } = await run('info_pagos_y_envios', { estado: 'Miranda', ciudad: 'Chacao' });
    expect(data.metodos_de_pago).toEqual([
      { nombre: 'Pago móvil', datos: ['Banesco', '0414-0000000'] },
    ]);
    expect(data.tasa_bcv).toEqual({ bs_por_ref: 200, fecha: '2026-10-20' });
    expect(data.envio).toEqual({ estado: 'Miranda', ciudad: 'Chacao', costo_ref: 5 });
    expect(
      (await run('info_pagos_y_envios', { estado: 'Zulia', ciudad: 'Maracaibo' })).data.envio
        .costo_ref,
    ).toBeNull();
  });

  it('hands over with the reason and summary', async () => {
    const { run, handOver } = setup();
    const outcome = await run('pasar_a_asesor', {
      motivo: 'Compra al mayor',
      resumen: '200 bombillos 9W',
    });
    expect(outcome.handedOver).toBe(true);
    expect(handOver).toHaveBeenCalledWith('Compra al mayor', '200 bombillos 9W');
  });

  it('answers bad input and unknown tools with an error the model can fix', async () => {
    const { run } = setup();
    expect((await run('buscar_productos', {})).isError).toBe(true);
    expect(
      (await run('crear_enlace_carrito', { productos: [{ id: 'p1', cantidad: 0 }] })).isError,
    ).toBe(true);
    expect((await run('borrar_todo', {})).isError).toBe(true);
  });
});

describe('formatting', () => {
  it('writes prices as REF, Venezuelan style', () => {
    expect(formatRef(1234.5)).toBe('REF 1.234,50');
  });

  it('encodes ids in the cart link', () => {
    expect(cartUrl('https://x.ve', [{ id: 'a b', qty: 2 }])).toBe(
      'https://x.ve/cart?agregar=a%20b:2',
    );
  });
});
