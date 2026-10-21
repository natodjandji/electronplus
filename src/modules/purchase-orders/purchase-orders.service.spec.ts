import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { FinanceService } from '../finance/finance.service';
import { SupplierPayableStatus } from '../finance/entities/supplier-payable.entity';
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

describe('PurchaseOrdersService settlement edge cases', () => {
  const admin = { id: 'admin' } as never;
  const line = (productId: string, quantityOrdered: number) => ({
    productId,
    sku: `SKU-${productId}`,
    name: `Producto ${productId}`,
    quantityOrdered,
    unitCost: 2,
    discountPerItem: 0,
    subtotal: 2 * quantityOrdered,
  });

  function setup(items: unknown[], order: Record<string, unknown> = {}) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.PURCHASE_ORDERS, 'oc-1', {
      supplierName: 'Lucerna',
      items,
      globalDiscount: 0,
      totals: { subtotal: 40, totalDiscount: 0, totalAmount: 40 },
      status: PurchaseOrderStatus.ISSUED,
      amountPaid: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...order,
    });
    const finance = new FinanceService(firestore as never, new EventEmitter2(), {} as never);
    const service = new PurchaseOrdersService(
      firestore as never,
      new ProductsService(firestore as never, new EventEmitter2()),
      finance,
    );
    const product = (id: string, stock: number) =>
      firestore.seed(Collections.PRODUCTS, id, {
        sku: `SKU-${id}`,
        name: `Producto ${id}`,
        stock,
        active: true,
        category: { id: 'cat', code: 'cables', label: 'Cables' },
        categoryId: 'cat',
        retailPrice: 5,
        wholesalePrice: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    return { firestore, service, product };
  }

  it('adds the units of every line of a product listed twice', async () => {
    const { firestore, service, product } = setup([line('p', 10), line('p', 10)]);
    product('p', 3);

    await service.registerPayment('oc-1', { amount: 40, method: 'transferencia' }, admin);

    expect(firestore.read(Collections.PRODUCTS, 'p')).toMatchObject({ stock: 23 });
  });

  it('settles an order even when one of its products was deleted since', async () => {
    const { firestore, service, product } = setup([line('gone', 10), line('p', 10)]);
    product('p', 3);

    const order = await service.registerPayment(
      'oc-1',
      { amount: 40, method: 'transferencia' },
      admin,
    );

    expect(order.status).toBe(PurchaseOrderStatus.PAID);
    expect(firestore.read(Collections.PRODUCTS, 'p')).toMatchObject({ stock: 13 });
  });

  it('settles an order whose payable was already paid from Finanzas', async () => {
    const { firestore, service, product } = setup([line('p', 20)], { linkedPayableId: 'cxp-1' });
    product('p', 3);
    firestore.seed(Collections.SUPPLIERS_PAYABLES, 'cxp-1', {
      amount: 40,
      amountPaid: 40,
      status: SupplierPayableStatus.PAID,
      dueDate: '2026-11-01',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const order = await service.registerPayment(
      'oc-1',
      { amount: 40, method: 'transferencia' },
      admin,
    );

    expect(order.status).toBe(PurchaseOrderStatus.PAID);
    expect(firestore.read(Collections.PRODUCTS, 'p')).toMatchObject({ stock: 23 });
    expect(firestore.read(Collections.SUPPLIERS_PAYABLES, 'cxp-1')).toMatchObject({
      amountPaid: 40,
    });
  });

  it('refuses a new order that lists a product on two lines', async () => {
    const { service } = setup([]);
    await expect(
      service.create(
        {
          supplierName: 'Lucerna',
          items: [
            { productId: 'p', quantityOrdered: 1, unitCost: 2 },
            { productId: 'p', quantityOrdered: 2, unitCost: 2 },
          ],
        } as never,
        admin,
      ),
    ).rejects.toThrow('más de una línea');
  });

  it('flips the status inside the transaction, before opening the payable', async () => {
    const { firestore, service } = setup([line('p', 20)], { status: PurchaseOrderStatus.DRAFT });
    const issuedFirst = await service.issue('oc-1');

    await expect(service.issue('oc-1')).rejects.toThrow('Only draft');
    expect(issuedFirst).toMatchObject({
      status: PurchaseOrderStatus.ISSUED,
      linkedPayableId: expect.any(String),
    });
    expect(
      firestore.read(Collections.SUPPLIERS_PAYABLES, issuedFirst.linkedPayableId!),
    ).toBeDefined();
  });

  it('goes back to draft when the payable cannot be opened', async () => {
    const { firestore, service } = setup([line('p', 20)], { status: PurchaseOrderStatus.DRAFT });
    jest
      .spyOn(FinanceService.prototype, 'createInvoice')
      .mockRejectedValueOnce(new Error('Firestore unavailable'));

    await expect(service.issue('oc-1')).rejects.toThrow('Firestore unavailable');
    expect(firestore.read(Collections.PURCHASE_ORDERS, 'oc-1')?.status).toBe(
      PurchaseOrderStatus.DRAFT,
    );
  });
});
