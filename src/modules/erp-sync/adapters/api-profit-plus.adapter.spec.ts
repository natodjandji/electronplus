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
          total: 2,
          productos: [
            {
              codigo: 'EP-LED-9W      ',
              descripcion: 'Bombillo LED 9W   ',
              categoria: ' Iluminación ',
              stock: -3,
              precio1: '4.50',
              precio2: 3.2,
            },
            {
              codigo: 'CAB-12',
              descripcion: 'Cable 12',
              categoria: null,
              stock: 12.5,
              precio1: 1,
              precio2: null,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    expect(await adapter.fetchInventory()).toEqual([
      {
        externalId: 'EP-LED-9W',
        sku: 'EP-LED-9W',
        name: 'Bombillo LED 9W',
        categoryCode: 'iluminacion',
        categoryLabel: 'Iluminación',
        retailPrice: 4.5,
        wholesalePrice: 3.2,
        stock: 0,
      },
      {
        externalId: 'CAB-12',
        sku: 'CAB-12',
        name: 'Cable 12',
        categoryCode: 'sin-categoria',
        categoryLabel: 'Sin categoría',
        retailPrice: 1,
        wholesalePrice: 0,
        stock: 12.5,
      },
    ]);
    expect(spy).toHaveBeenCalledWith(
      'https://bridge.test/api/productos-sincronizacion',
      expect.objectContaining({ headers: { Authorization: 'Bearer key' } }),
    );
  });

  it('cannot take sales yet, and says so instead of pretending it did', async () => {
    expect(adapter.canReportSales()).toBe(false);
    await expect(
      adapter.reportSale({ orderId: 'o1', items: [], total: 0, soldAt: new Date() }),
    ).rejects.toThrow('todavía no recibe ventas');
  });
});
