import { Logger } from '@nestjs/common';
import { ApiProfitPlusAdapter } from './api-profit-plus.adapter';

describe('ApiProfitPlusAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  const env: Record<string, string> = {
    PROFIT_PLUS_API_URL: 'https://bridge.test/',
    PROFIT_PLUS_API_KEY: 'key',
  };
  const adapter = new ApiProfitPlusAdapter({ get: (key: string) => env[key] } as never);

  it('cleans what Profit Plus sends: padded codes, negative stock, text numbers', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 3,
          productos: [
            {
              codigo: 'LAM001001      ',
              referencia: ' 91248923474 ',
              modelo: ' LP609   ',
              descripcion: 'Bombillo LED 9W   ',
              categoriaCodigo: '07    ',
              categoria: ' Iluminación ',
              marcaCodigo: ' LUC ',
              marca: ' Lucerna ',
              stock: -3,
              precio1: '4.50',
              precio2: 3.2,
            },
            {
              codigo: 'CAB-12',
              referencia: '   ',
              descripcion: 'Cable 12',
              categoria: null,
              marca: '   ',
              stock: 12.5,
              precio1: 1,
              precio2: null,
            },
            {
              codigo: 'TOM-2',
              descripcion: 'Toma doble',
              categoriaCodigo: '05',
              categoria: null,
              marcaCodigo: '09',
              stock: 3,
              precio1: 2,
              precio2: 1.5,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    expect(await adapter.fetchInventory()).toEqual([
      {
        // The reference is the barcode and the Modelo field the store's SKU;
        // the internal code stays the identity.
        externalId: 'LAM001001',
        sku: '91248923474',
        model: 'LP609',
        name: 'Bombillo LED 9W',
        categoryCode: 'iluminacion',
        categoryLabel: 'Iluminación',
        categoryExternalId: '07',
        brand: 'Lucerna',
        brandExternalId: 'LUC',
        retailPrice: 4.5,
        wholesalePrice: 3.2,
        stock: 0,
      },
      {
        // No reference in Profit: shown by its internal code.
        externalId: 'CAB-12',
        sku: 'CAB-12',
        name: 'Cable 12',
        categoryCode: 'sin-categoria',
        categoryLabel: 'Sin categoría',
        retailPrice: 1,
        wholesalePrice: 0,
        stock: 12.5,
      },
      // A category code without a name in Profit: shown by its code.
      {
        externalId: 'TOM-2',
        sku: 'TOM-2',
        name: 'Toma doble',
        categoryCode: 'categoria-05',
        categoryLabel: 'Categoría 05',
        categoryExternalId: '05',
        // Same for a brand: shown by its code.
        brand: 'Marca 09',
        brandExternalId: '09',
        retailPrice: 2,
        wholesalePrice: 1.5,
        stock: 3,
      },
    ]);
    expect(spy).toHaveBeenCalledWith(
      'https://bridge.test/api/productos-sincronizacion',
      expect.objectContaining({ headers: { Authorization: 'Bearer key' } }),
    );
  });

  it('says where the SKU came from, once, and again when that changes', async () => {
    const fresh = new ApiProfitPlusAdapter({ get: (key: string) => env[key] } as never);
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const respond = (extra: object) =>
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ total: 0, productos: [], ...extra }), { status: 200 }),
        );

    // A bridge from before 1.2.0 sends no column at all.
    respond({});
    await fresh.fetchInventory();
    respond({});
    await fresh.fetchInventory();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /no envía el SKU ni los costos: instala la versión 1\.3\.0/,
    );

    respond({ columnaSku: 'modelo' });
    await fresh.fetchInventory();
    expect(info).toHaveBeenCalledWith('Profit Plus: el SKU viene de art.modelo (campo Modelo).');

    respond({ columnaSku: null, columnasArt: ['co_art', 'ref', 'art_des'] });
    await fresh.fetchInventory();
    expect(warn).toHaveBeenLastCalledWith(
      'Profit Plus no tiene el campo Modelo en art: los productos van sin SKU. Columnas: co_art, ref, art_des',
    );
  });

  describe('the cost', () => {
    const product = (codigo: string, extra: object) => ({
      codigo,
      descripcion: `Artículo ${codigo}`,
      categoria: 'Iluminación',
      stock: 1,
      precio1: 10,
      precio2: 8,
      ...extra,
    });
    const respondWith = (body: object) =>
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    const fresh = () => new ApiProfitPlusAdapter({ get: (key: string) => env[key] } as never);
    const costs = async (adapter: ApiProfitPlusAdapter) =>
      Object.fromEntries((await adapter.fetchInventory()).map((i) => [i.externalId, i.cost]));

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    it('takes the last cost in the other currency (ULOM), and none when it is 0', async () => {
      respondWith({
        total: 4,
        columnaSku: 'modelo',
        // The bridge sends every cost column, in the table's order.
        columnasCosto: ['ult_cos_un', 'cos_pro_un', 'ULT_COS_OM', 'cos_pro_om'],
        productos: [
          product('A', {
            costos: { ult_cos_un: 152, cos_pro_un: 150, ULT_COS_OM: 4.25, cos_pro_om: 4 },
          }),
          product('B', {
            costos: { ult_cos_un: 0, cos_pro_un: 0, ULT_COS_OM: '3.10', cos_pro_om: 0 },
          }),
          // The other columns are never taken, even with a value.
          product('C', {
            costos: { ult_cos_un: 90, cos_pro_un: 88, ULT_COS_OM: 0, cos_pro_om: 2.4 },
          }),
          product('D', {}),
        ],
      });
      expect(await costs(fresh())).toEqual({ A: 4.25, B: 3.1, C: null, D: null });
    });

    it('also finds it in a column named by its code', async () => {
      respondWith({
        total: 1,
        columnaSku: 'modelo',
        columnasCosto: ['ULOM'],
        productos: [product('A', { costos: { ULOM: 2.2 } })],
      });
      expect(await costs(fresh())).toEqual({ A: 2.2 });
    });

    it('leaves the cost alone when the bridge sends none, or not the columns it uses', async () => {
      respondWith({ total: 1, columnaSku: 'modelo', productos: [product('A', {})] });
      expect(await costs(fresh())).toEqual({ A: undefined });

      respondWith({
        total: 1,
        columnaSku: 'modelo',
        columnasCosto: ['ult_cos_un', 'cos_pro_un'],
        productos: [product('A', { costos: { ult_cos_un: 900, cos_pro_un: 880 } })],
      });
      expect(await costs(fresh())).toEqual({ A: undefined });
    });

    it('says where the cost comes from and how many have one, once each', async () => {
      const adapter = fresh();
      const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const feed = (productos: object[]) => ({
        total: productos.length,
        columnaSku: 'modelo',
        columnasCosto: ['ult_cos_un', 'ult_cos_om'],
        productos,
      });

      respondWith({ total: 0, columnaSku: 'modelo', productos: [] });
      await adapter.fetchInventory();
      expect(warn).toHaveBeenLastCalledWith(
        'El bridge de Profit Plus no envía los costos: instala la versión 1.3.0 en la PC de la tienda.',
      );

      const twoOfThree = [
        product('A', { costos: { ult_cos_un: 150, ult_cos_om: 4 } }),
        product('B', { costos: { ult_cos_un: 0, ult_cos_om: 2 } }),
        product('C', { costos: { ult_cos_un: 90, ult_cos_om: 0 } }),
      ];
      respondWith(feed(twoOfThree));
      await adapter.fetchInventory();
      respondWith(feed(twoOfThree));
      await adapter.fetchInventory();
      const lines = info.mock.calls.map(([line]) => line);
      expect(lines.filter((l) => /el costo viene de/.test(l))).toEqual([
        'Profit Plus: el costo viene de art.ult_cos_om.',
      ]);
      expect(lines.filter((l) => /tienen costo/.test(l))).toEqual([
        'Profit Plus: 2 de 3 artículos tienen costo.',
      ]);

      // A cost in bolívares costs more than the article sells for.
      respondWith(feed([...twoOfThree, product('D', { costos: { ult_cos_om: 3650 } })]));
      await adapter.fetchInventory();
      expect(info).toHaveBeenLastCalledWith('Profit Plus: 3 de 4 artículos tienen costo.');
      expect(warn).toHaveBeenLastCalledWith(
        'Profit Plus: 1 artículos cuestan más de lo que se venden al detal: D (costo 3650, detal 10). Revisa en Profit que el costo esté en la misma moneda que los precios.',
      );
    });
  });

  it('cannot take sales yet, and says so instead of pretending it did', async () => {
    expect(adapter.canReportSales()).toBe(false);
    await expect(
      adapter.reportSale({ orderId: 'o1', items: [], total: 0, soldAt: new Date() }),
    ).rejects.toThrow('todavía no recibe ventas');
  });
});
