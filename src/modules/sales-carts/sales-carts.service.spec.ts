import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { PriceList, SalesCartStatus } from './entities/sales-cart.entity';
import { computeSalesCartTotals } from './sales-cart-totals';
import { storeDay } from '../../common/utils/store-day';
import { SalesCartsService } from './sales-carts.service';

const seller = { id: 'seller-1', email: 'ana@tienda.com', role: Role.SELLER };
const otherSeller = { id: 'seller-2', email: 'luis@tienda.com', role: Role.SELLER };
const admin = { id: 'admin-1', email: 'jefe@tienda.com', role: Role.ADMIN };

function build() {
  const firestore = new FakeFirestore();
  const products = new Map<string, Record<string, unknown>>([
    [
      'breaker-20a',
      {
        id: 'breaker-20a',
        sku: 'BRK-20',
        name: 'Breaker 20A',
        retailPrice: 10,
        wholesalePrice: 8,
        active: true,
      },
    ],
    [
      'cable-12',
      {
        id: 'cable-12',
        sku: 'CAB-12',
        name: 'Cable 12',
        retailPrice: 2.5,
        wholesalePrice: 2,
        active: true,
      },
    ],
    [
      'oculto',
      { id: 'oculto', sku: 'X', name: 'Oculto', retailPrice: 1, wholesalePrice: 1, active: false },
    ],
  ]);
  const productsService = {
    findPublicById: (id: string) =>
      products.has(id)
        ? Promise.resolve(products.get(id))
        : Promise.reject(new NotFoundException()),
  };
  const usersService = { findById: () => Promise.resolve({ displayName: 'Ana Pérez' }) };
  const exchangeRate = { getBcvRate: () => Promise.resolve({ rate: 40 }) };
  const config = { get: () => 'https://electronplus.com.ve/' };
  const service = new SalesCartsService(
    firestore as never,
    productsService as never,
    usersService as never,
    exchangeRate as never,
    config as never,
  );
  return { firestore, service, products };
}

describe('SalesCartsService', () => {
  it('opens a cart for the seller, visible to them and to admins only', async () => {
    const { service } = build();
    const cart = await service.create(seller, { customer: { name: '  Juan ', phone: '' } });
    expect(cart).toMatchObject({
      sellerId: 'seller-1',
      sellerName: 'Ana Pérez',
      status: SalesCartStatus.OPEN,
      customer: { name: 'Juan' },
      priceList: PriceList.RETAIL,
      discountPct: 0,
      items: [],
    });

    expect((await service.list(seller)).map((c) => c.id)).toEqual([cart.id]);
    expect(await service.list(otherSeller)).toEqual([]);
    expect((await service.list(admin)).map((c) => c.id)).toEqual([cart.id]);
    await expect(service.findOne(otherSeller, cart.id)).rejects.toThrow(NotFoundException);
    await expect(service.addItem(otherSeller, cart.id, { productId: 'cable-12' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reuses a blank cart instead of opening another, and clears leftover blank ones', async () => {
    const { service, firestore } = build();
    const first = await service.create(seller, {});
    expect((await service.create(seller, {})).id).toBe(first.id);
    expect(await service.list(seller)).toHaveLength(1);

    // Blank carts left from before (two finished sales, nothing scanned after).
    const stale = { sellerId: seller.id, sellerName: 'Ana', status: 'open', customer: {} };
    const blank = { ...stale, priceList: 'retail', discountPct: 0, items: [] };
    firestore.seed(Collections.SALES_CARTS, 'old-1', { ...blank, updatedAt: new Date(1) });
    firestore.seed(Collections.SALES_CARTS, 'old-2', { ...blank, updatedAt: new Date(2) });
    expect((await service.create(seller, { customer: { name: 'Rosa' } })).customer).toEqual({
      name: 'Rosa',
    });
    expect(await service.list(seller)).toHaveLength(1);

    // A cart with something in it is never reused: the next one is new.
    const withCustomer = (await service.list(seller))[0];
    expect((await service.create(seller, {})).id).not.toBe(withCustomer.id);
    expect(await service.list(seller)).toHaveLength(2);

    // Other sellers' blank carts are theirs to keep.
    const theirs = await service.create(otherSeller, {});
    await service.create(seller, {});
    expect((await service.list(otherSeller)).map((c) => c.id)).toEqual([theirs.id]);
  });

  it('adds a unit per scan and keeps the price from the first scan', async () => {
    const { service, products } = build();
    const { id } = await service.create(seller, {});
    await service.addItem(seller, id, { productId: 'breaker-20a' });
    products.get('breaker-20a')!.retailPrice = 99;
    const cart = await service.addItem(seller, id, { productId: 'breaker-20a' });
    expect(cart.items).toEqual([
      expect.objectContaining({ productId: 'breaker-20a', qty: 2, retailPrice: 10 }),
    ]);

    await expect(service.addItem(seller, id, { productId: 'oculto' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.addItem(seller, id, { productId: 'no-existe' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('sets a line quantity, and 0 removes it', async () => {
    const { service } = build();
    const { id } = await service.create(seller, {});
    await service.addItem(seller, id, { productId: 'cable-12' });
    expect((await service.setItemQty(seller, id, 'cable-12', 25)).items[0].qty).toBe(25);
    expect((await service.setItemQty(seller, id, 'cable-12', 0)).items).toEqual([]);
    await expect(service.setItemQty(seller, id, 'cable-12', 1)).rejects.toThrow(NotFoundException);
  });

  it('lets a seller set any discount, the price list and the customer', async () => {
    const { service } = build();
    const { id } = await service.create(seller, {});
    expect((await service.update(seller, id, { discountPct: 35 })).discountPct).toBe(35);
    expect((await service.update(admin, id, { discountPct: 25 })).discountPct).toBe(25);

    const updated = await service.update(seller, id, {
      priceList: PriceList.WHOLESALE,
      customer: { name: 'Ferretería Sol', taxId: ' J-123 ' },
    });
    expect(updated).toMatchObject({
      priceList: PriceList.WHOLESALE,
      customer: { name: 'Ferretería Sol', taxId: 'J-123' },
    });
  });

  it('totals like an order: discount on the subtotal, then 16% IVA', () => {
    const items = [
      { productId: 'a', sku: 'A', name: 'A', qty: 3, retailPrice: 10, wholesalePrice: 8 },
      { productId: 'b', sku: 'B', name: 'B', qty: 4, retailPrice: 2.5, wholesalePrice: 2 },
    ];
    expect(
      computeSalesCartTotals({ items, priceList: PriceList.RETAIL, discountPct: 10 }),
    ).toMatchObject({
      subtotal: 40,
      discountAmount: 4,
      taxableBase: 36,
      taxAmount: 5.76,
      total: 41.76,
    });
    expect(
      computeSalesCartTotals({ items, priceList: PriceList.WHOLESALE, discountPct: 0 }).subtotal,
    ).toBe(32);
  });

  it('shares a frozen, numbered quote that keeps its link when shared again', async () => {
    const { service, firestore } = build();
    const { id } = await service.create(seller, { customer: { name: 'Juan' } });
    await expect(service.share(seller, id)).rejects.toThrow(BadRequestException);

    await service.addItem(seller, id, { productId: 'breaker-20a', qty: 3 });
    const first = await service.share(seller, id);
    expect(first.number).toBe(1);
    expect(first.url).toBe(`https://electronplus.com.ve/cotizacion/${first.token}`);
    const days = (first.validUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(3);

    const quote = await service.findSharedQuote(first.token);
    expect(quote).toMatchObject({
      number: 1,
      sellerName: 'Ana Pérez',
      customer: { name: 'Juan' },
      lines: [{ sku: 'BRK-20', name: 'Breaker 20A', qty: 3, unitPrice: 10, lineTotal: 30 }],
      subtotal: 30,
      taxAmount: 4.8,
      total: 34.8,
      bcvRate: 40,
    });
    expect(quote).not.toHaveProperty('cartId');
    expect(quote.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);

    // The same quote as a printable PDF, numbered like the link.
    const { number, pdf } = await service.sharedQuotePdf(first.token);
    expect(number).toBe(1);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // Edits don't reach the link until the seller shares again.
    await service.addItem(seller, id, { productId: 'cable-12' });
    expect((await service.findSharedQuote(first.token)).lines).toHaveLength(1);
    const again = await service.share(seller, id);
    expect(again).toMatchObject({ token: first.token, number: 1 });
    expect((await service.findSharedQuote(first.token)).lines).toHaveLength(2);

    const other = await service.create(seller, {});
    await service.addItem(seller, other.id, { productId: 'cable-12' });
    expect((await service.share(seller, other.id)).number).toBe(2);
    expect(firestore.read(Collections.COUNTERS, 'salesQuotes')).toEqual({ value: 2 });

    await expect(service.findSharedQuote('../../users/x')).rejects.toThrow(NotFoundException);
    await expect(service.findSharedQuote('a'.repeat(24))).rejects.toThrow(NotFoundException);
  });

  it('finishes a sale once, keeps it in the day list, and locks the cart', async () => {
    const { service } = build();
    const empty = await service.create(seller, {});
    await expect(service.complete(seller, empty.id, {})).rejects.toThrow(BadRequestException);

    await service.addItem(seller, empty.id, { productId: 'cable-12' });
    const done = await service.complete(seller, empty.id, { invoiceRef: ' F-0042 ' });
    expect(done).toMatchObject({
      status: SalesCartStatus.COMPLETED,
      invoiceRef: 'F-0042',
      closedDay: storeDay(new Date()),
    });
    await expect(service.addItem(seller, empty.id, { productId: 'cable-12' })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.share(seller, empty.id)).rejects.toThrow(ConflictException);

    expect(await service.list(seller)).toEqual([]);
    expect((await service.list(seller, 'completed')).map((c) => c.id)).toEqual([empty.id]);
    expect(await service.list(otherSeller, 'completed')).toEqual([]);
    // A finished sale stays on record: it can't be cancelled away.
    await expect(service.cancel(seller, empty.id)).rejects.toThrow(ConflictException);
  });

  it('deletes a cancelled cart outright, but its shared quote keeps working', async () => {
    const { service, firestore } = build();
    const cart = await service.create(seller, {});
    await service.addItem(seller, cart.id, { productId: 'cable-12' });
    const { token } = await service.share(seller, cart.id);

    await expect(service.cancel(otherSeller, cart.id)).rejects.toThrow(NotFoundException);
    await service.cancel(seller, cart.id);

    expect(firestore.read(Collections.SALES_CARTS, cart.id)).toBeUndefined();
    expect(await service.list(seller)).toEqual([]);
    expect(await service.list(seller, 'completed')).toEqual([]);
    await expect(service.findOne(seller, cart.id)).rejects.toThrow(NotFoundException);
    expect((await service.findSharedQuote(token)).lines).toHaveLength(1);
  });

  it('tells the store day in Caracas time', () => {
    expect(storeDay(new Date('2026-10-13T02:30:00Z'))).toBe('2026-10-12');
    expect(storeDay(new Date('2026-10-13T04:30:00Z'))).toBe('2026-10-13');
  });
});
