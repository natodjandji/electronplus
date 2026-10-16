import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ProductsService } from '../products/products.service';
import { PurchaseOrderStatus } from './entities/purchase-order.entity';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService stock-in on settlement', () => {
  function seedProduct(firestore: FakeFirestore, id: string, overrides: Record<string, unknown>) {
    firestore.seed(Collections.PRODUCTS, id, {
      sku: `SKU-${id}`,
      name: `Producto ${id}`,
      stock: 3,
      active: true,
      category: { id: 'cat', code: 'cables', label: 'Cables' },
      categoryId: 'cat',
      retailPrice: 5,
      wholesalePrice: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  it('adds stock to products made in the web, not to those synced from Profit Plus', async () => {
    const firestore = new FakeFirestore();
    seedProduct(firestore, 'manual', {});
    seedProduct(firestore, 'de-profit', { erpExternalId: 'LUC-001' });
    const item = (productId: string) => ({
      productId,
      sku: `SKU-${productId}`,
      name: `Producto ${productId}`,
      quantityOrdered: 10,
      unitCost: 2,
      discountPerItem: 0,
      subtotal: 20,
    });
    firestore.seed(Collections.PURCHASE_ORDERS, 'oc-1', {
      supplierName: 'Lucerna',
      items: [item('manual'), item('de-profit')],
      globalDiscount: 0,
      totals: { subtotal: 40, totalDiscount: 0, totalAmount: 40 },
      status: PurchaseOrderStatus.ISSUED,
      amountPaid: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new PurchaseOrdersService(
      firestore as never,
      new ProductsService(firestore as never, new EventEmitter2()),
      {} as never,
    );

    const order = await service.registerPayment('oc-1', { amount: 40, method: 'transferencia' }, {
      id: 'admin',
    } as never);

    expect(order.status).toBe(PurchaseOrderStatus.PAID);
    expect(firestore.read(Collections.PRODUCTS, 'manual')).toMatchObject({ stock: 13 });
    // Its stock reaches the web once the purchase is registered in Profit.
    expect(firestore.read(Collections.PRODUCTS, 'de-profit')).toMatchObject({ stock: 3 });
  });
});
