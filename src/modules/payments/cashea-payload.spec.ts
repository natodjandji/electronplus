import { BadRequestException } from '@nestjs/common';
import { FulfillmentMethod } from '../orders/entities/order.entity';
import {
  buildCasheaPayload,
  casheaIdentificationNumber,
  casheaPayloadTotal,
  CasheaOrderInput,
} from './cashea-payload';

const OPTIONS = {
  redirectUrl: 'https://electronplus.com.ve/cashea/retorno/order-1',
  merchantName: 'Electron Plus',
  externalClientId: '351',
  storeId: 123,
  storeName: 'Electron Plus',
  fallbackImageUrl: 'https://electronplus.com.ve/og-image.jpg',
};

function order(overrides: Partial<CasheaOrderInput> = {}): CasheaOrderInput {
  return {
    id: 'order-1',
    fulfillmentMethod: FulfillmentMethod.PICKUP,
    shippingTaxId: 'V-12345678',
    subtotal: 59,
    discountAmount: 0,
    shippingCost: 0,
    items: [
      { productId: 'p1', sku: '91248923474', name: 'Lámpara lineal', qty: 2, unitPrice: 25 },
      { productId: 'p2', sku: 'LUC-LED9', name: 'Bombillo LED 9W', qty: 1, unitPrice: 9 },
    ],
    ...overrides,
  };
}

const products = new Map([
  ['p1', { imageUrl: 'https://cdn.example/p1.jpg', specs: '  Lámpara LED de 120 cm, 36 W  ' }],
  ['p2', { imageUrl: '', specs: '' }],
]);

describe('casheaIdentificationNumber', () => {
  it('takes a cédula (V or E) as digits only', () => {
    expect(casheaIdentificationNumber('V-12345678')).toBe('12345678');
    expect(casheaIdentificationNumber('v-12.345.678')).toBe('12345678');
    expect(casheaIdentificationNumber('E-81234567')).toBe('81234567');
  });

  it('refuses a company RIF, a passport or nothing', () => {
    for (const taxId of ['J-12345678-9', 'G-20000001-4', 'P-123456', undefined, 'V-12']) {
      expect(() => casheaIdentificationNumber(taxId)).toThrow(BadRequestException);
    }
  });
});

describe('buildCasheaPayload', () => {
  it('sends the stored order: unit prices, IVA per unit, photo and description', () => {
    const payload = buildCasheaPayload(order(), products, OPTIONS);
    expect(payload).toMatchObject({
      deliveryMethod: 'IN_STORE',
      redirectUrl: OPTIONS.redirectUrl,
      merchantName: 'Electron Plus',
      identificationNumber: '12345678',
      externalClientId: '351',
      invoiceId: 'order-1',
      deliveryPrice: 0,
    });
    expect(payload.orders).toEqual([
      {
        store: { id: 123, name: 'Electron Plus', enabled: true },
        products: [
          {
            id: 'p1',
            name: 'Lámpara lineal',
            sku: '91248923474',
            description: 'Lámpara LED de 120 cm, 36 W',
            imageUrl: 'https://cdn.example/p1.jpg',
            quantity: 2,
            price: 25,
            tax: 4,
            discount: 0,
          },
          {
            id: 'p2',
            name: 'Bombillo LED 9W',
            sku: 'LUC-LED9',
            description: 'Bombillo LED 9W',
            imageUrl: OPTIONS.fallbackImageUrl,
            quantity: 1,
            price: 9,
            tax: 1.44,
            discount: 0,
          },
        ],
      },
    ]);
    // 59 + 16% IVA, as the order charges it.
    expect(casheaPayloadTotal(payload)).toBe(68.44);
  });

  it('sends a delivery with its shipping cost', () => {
    const payload = buildCasheaPayload(
      order({ fulfillmentMethod: FulfillmentMethod.DELIVERY, shippingCost: 5 }),
      products,
      OPTIONS,
    );
    expect(payload.deliveryMethod).toBe('DELIVERY');
    expect(payload.deliveryPrice).toBe(5);
    expect(casheaPayloadTotal(payload)).toBe(73.44);
  });

  it('treats an order from before pickup existed as a delivery', () => {
    const payload = buildCasheaPayload(order({ fulfillmentMethod: undefined }), products, OPTIONS);
    expect(payload.deliveryMethod).toBe('DELIVERY');
  });

  it('spreads a discount code over the units, matching the order total', () => {
    // 10% off 59 = 5.90; IVA on 53.10 = 8.50; the order charges 61.60.
    const payload = buildCasheaPayload(order({ discountAmount: 5.9 }), products, OPTIONS);
    const [lamp, bulb] = payload.orders[0].products;
    expect(lamp).toMatchObject({ price: 25, discount: 2.5, tax: 3.6 });
    expect(bulb).toMatchObject({ price: 9, discount: 0.9, tax: 1.3 });
    expect(casheaPayloadTotal(payload)).toBeCloseTo(61.6, 1);
  });

  it('never sends an empty name or SKU, which Cashea rejects', () => {
    const payload = buildCasheaPayload(
      order({ items: [{ productId: 'p9', sku: '', name: 'Cable', qty: 1, unitPrice: 3 }] }),
      new Map(),
      OPTIONS,
    );
    expect(payload.orders[0].products[0]).toMatchObject({
      sku: 'p9',
      description: 'Cable',
      imageUrl: OPTIONS.fallbackImageUrl,
    });
  });
});
