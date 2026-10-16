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
        // The reference is what the store calls the code; the internal code
        // stays the identity.
        externalId: 'LAM001001',
        sku: '91248923474',
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

  it('cannot take sales yet, and says so instead of pretending it did', async () => {
    expect(adapter.canReportSales()).toBe(false);
    await expect(
      adapter.reportSale({ orderId: 'o1', items: [], total: 0, soldAt: new Date() }),
    ).rejects.toThrow('todavía no recibe ventas');
  });
});
