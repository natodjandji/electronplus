import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FulfillmentMethod, OrderStatus } from '../orders/entities/order.entity';
import { CasheaError } from './cashea.client';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { PAYMENT_VERIFIED_EVENT, PaymentsService } from './payments.service';

const owner: AuthenticatedUser = { id: 'user-1', email: 'owner@test.com', role: Role.CLIENT };
const intruder: AuthenticatedUser = { id: 'user-2', email: 'x@test.com', role: Role.CLIENT };
const ORDER_ID = 'order-1';
const PAYMENT_ID = 'pay-cashea';

const ENV: Record<string, unknown> = {
  PUBLIC_SITE_URL: 'https://electronplus.com.ve/',
  CASHEA_MERCHANT_NAME: 'Electron Plus',
  CASHEA_EXTERNAL_CLIENT_ID: '351',
  CASHEA_STORE_ID: 123,
  CASHEA_STORE_NAME: 'Electron Plus',
};

const METHODS: Record<string, object> = {
  'pago-movil': {
    id: 'pago-movil',
    backendMethod: PaymentMethod.PAGO_MOVIL,
    label: 'Pago móvil',
    needsReference: true,
    enabled: true,
  },
  efectivo: {
    id: 'efectivo',
    backendMethod: PaymentMethod.CASH,
    label: 'Efectivo en tienda',
    needsReference: false,
    enabled: true,
  },
  zelle: {
    id: 'zelle',
    backendMethod: PaymentMethod.ZELLE,
    label: 'Zelle',
    needsReference: true,
    enabled: false,
  },
};

function setup(
  options: { fulfillment?: FulfillmentMethod; orderStatus?: OrderStatus; minAmount?: number } = {},
) {
  const firestore = new FakeFirestore();
  firestore.seed(Collections.ORDERS, ORDER_ID, {
    userId: owner.id,
    status: options.orderStatus ?? OrderStatus.PENDING_PAYMENT_VERIFICATION,
    fulfillmentMethod: options.fulfillment ?? FulfillmentMethod.PICKUP,
    shippingTaxId: 'V-12345678',
    subtotal: 50,
    discountAmount: 0,
    taxAmount: 8,
    shippingCost: 0,
    totalAmount: 58,
    items: [{ productId: 'p1', sku: '91248923474', name: 'Lámpara', qty: 2, unitPrice: 25 }],
  });
  firestore.seed(Collections.PRODUCTS, 'p1', {
    imageUrl: 'https://cdn.example/p1.jpg',
    specs: 'Lámpara LED',
  });
  const cashea = {
    isConfigured: () => true,
    minAmount: jest.fn().mockResolvedValue(options.minAmount ?? 20),
    createCheckout: jest.fn().mockResolvedValue({
      payloadId: 555,
      checkoutUrl: 'https://web.cashea.app/checkout?order-payload-id=555',
    }),
    confirmDownPayment: jest.fn().mockResolvedValue(undefined),
    cancelOrder: jest.fn().mockResolvedValue(undefined),
  };
  const uploads = {
    uploadPaymentProof: jest.fn().mockResolvedValue('payment-proofs/abc.jpg'),
    getSignedProofUrl: jest.fn(async (path: string) => `https://signed.example/${path}`),
  };
  const paymentMethods = { findById: async (id: string) => METHODS[id] ?? null };
  const events = new EventEmitter2();
  const verified = jest.fn();
  events.on(PAYMENT_VERIFIED_EVENT, verified);
  const service = new PaymentsService(
    firestore as never,
    {} as never,
    events,
    uploads as never,
    cashea as never,
    paymentMethods as never,
    { get: (key: string) => ENV[key] } as never,
  );
  const payment = () => firestore.read(Collections.PAYMENTS, PAYMENT_ID) as Record<string, any>;
  const seedCashea = (cashea: Record<string, unknown> = {}, status = PaymentStatus.PENDING) =>
    firestore.seed(Collections.PAYMENTS, PAYMENT_ID, {
      orderId: ORDER_ID,
      method: PaymentMethod.CASHEA,
      amount: 58,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
      cashea: {
        payloadId: 555,
        checkoutUrl: 'https://web.cashea.app/checkout?order-payload-id=555',
        total: 58,
        ...cashea,
      },
    });
  return { firestore, service, cashea, uploads, verified, payment, seedCashea };
}

describe('PaymentsService · Cashea', () => {
  describe('starting the payment', () => {
    it('creates the checkout from the stored order and keeps where the buyer goes', async () => {
      const { service, cashea } = setup();
      const saved = await service.initiate(ORDER_ID, PaymentMethod.CASHEA, 58);
      const payload = cashea.createCheckout.mock.calls[0][0];
      expect(payload).toMatchObject({
        deliveryMethod: 'IN_STORE',
        redirectUrl: 'https://electronplus.com.ve/cashea/retorno/order-1',
        identificationNumber: '12345678',
        invoiceId: ORDER_ID,
        externalClientId: '351',
        orders: [
          {
            store: { id: 123, name: 'Electron Plus', enabled: true },
            products: [
              expect.objectContaining({
                id: 'p1',
                imageUrl: 'https://cdn.example/p1.jpg',
                price: 25,
                tax: 4,
                quantity: 2,
              }),
            ],
          },
        ],
      });
      expect(saved).toMatchObject({
        method: PaymentMethod.CASHEA,
        status: PaymentStatus.PENDING,
        amount: 58,
        externalReference: '555',
        cashea: {
          payloadId: 555,
          checkoutUrl: 'https://web.cashea.app/checkout?order-payload-id=555',
          total: 58,
        },
      });
    });

    it('refuses a purchase under Cashea’s minimum, before creating anything', async () => {
      const { service, cashea } = setup({ minAmount: 100 });
      await expect(service.initiate(ORDER_ID, PaymentMethod.CASHEA, 58)).rejects.toThrow(
        'Cashea requiere una compra mínima de $100.00.',
      );
      expect(cashea.createCheckout).not.toHaveBeenCalled();
    });

    it('tells checkout whether Cashea is on, and its minimum', async () => {
      const { service } = setup();
      await expect(service.casheaConfig()).resolves.toEqual({ available: true, minAmount: 20 });
    });
  });

  describe('coming back from Cashea', () => {
    it('records Cashea’s order number for the order’s owner, once', async () => {
      const { service, seedCashea, payment } = setup();
      seedCashea();
      await service.casheaReturn(ORDER_ID, '777', owner);
      expect(payment().cashea).toMatchObject({ orderId: '777', returnedAt: expect.any(String) });
      // Reloading the return page is harmless…
      await expect(service.casheaReturn(ORDER_ID, '777', owner)).resolves.toBeDefined();
      // …a different number for the same purchase isn't.
      await expect(service.casheaReturn(ORDER_ID, '778', owner)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses another user and a malformed number', async () => {
      const { service, seedCashea } = setup();
      seedCashea();
      await expect(service.casheaReturn(ORDER_ID, '777', intruder)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.casheaReturn(ORDER_ID, '77a', owner)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reporting the down payment', () => {
    it('takes an online payment through an enabled method, with its reference and proof', async () => {
      const { service, seedCashea, payment, uploads } = setup();
      seedCashea({ orderId: '777' });
      const saved = await service.casheaReportDownPayment(PAYMENT_ID, owner, {
        atStore: false,
        methodId: 'pago-movil',
        amount: 23.2,
        reference: ' 0412-998877 ',
        proofBase64: 'data:image/png;base64,AAAA',
      });
      expect(payment().cashea.downPayment).toEqual({
        atStore: false,
        methodId: 'pago-movil',
        methodLabel: 'Pago móvil',
        amount: 23.2,
        reference: '0412-998877',
        proofUrl: 'payment-proofs/abc.jpg',
        reportedAt: expect.any(String),
      });
      expect(uploads.uploadPaymentProof).toHaveBeenCalled();
      // The buyer sees a signed link to their proof, not the storage path.
      expect(saved.cashea?.downPayment).toMatchObject({
        proofUrl: 'https://signed.example/payment-proofs/abc.jpg',
      });
    });

    it('refuses a report before the buyer finished on Cashea', async () => {
      const { service, seedCashea } = setup();
      seedCashea();
      await expect(
        service.casheaReportDownPayment(PAYMENT_ID, owner, { atStore: true }),
      ).rejects.toThrow('Primero completa la compra en Cashea.');
    });

    it('refuses cash, a disabled method, a missing reference or an amount that isn’t a down payment', async () => {
      const { service, seedCashea } = setup();
      seedCashea({ orderId: '777' });
      const report = (overrides: object) =>
        service.casheaReportDownPayment(PAYMENT_ID, owner, {
          atStore: false,
          methodId: 'pago-movil',
          amount: 20,
          reference: '123',
          ...overrides,
        });
      await expect(report({ methodId: 'efectivo' })).rejects.toThrow(BadRequestException);
      await expect(report({ methodId: 'zelle' })).rejects.toThrow(BadRequestException);
      await expect(report({ reference: '  ' })).rejects.toThrow(BadRequestException);
      await expect(report({ amount: 58 })).rejects.toThrow(BadRequestException);
      await expect(report({ amount: 0 })).rejects.toThrow(BadRequestException);
    });

    it('lets a pickup order pay the down payment at the store, not a delivery', async () => {
      const pickup = setup();
      pickup.seedCashea({ orderId: '777' });
      await pickup.service.casheaReportDownPayment(PAYMENT_ID, owner, { atStore: true });
      expect(pickup.payment().cashea.downPayment).toEqual({
        atStore: true,
        reportedAt: expect.any(String),
      });

      const delivery = setup({ fulfillment: FulfillmentMethod.DELIVERY });
      delivery.seedCashea({ orderId: '777' });
      await expect(
        delivery.service.casheaReportDownPayment(PAYMENT_ID, owner, { atStore: true }),
      ).rejects.toThrow('La inicial en tienda es solo para pedidos con retiro en tienda.');
    });
  });

  describe('confirming the down payment', () => {
    it('confirms it to Cashea and pays the order, once', async () => {
      const { service, seedCashea, cashea, payment, verified } = setup();
      seedCashea({ orderId: '777' });
      await service.casheaConfirm(PAYMENT_ID, 'admin-1', 23.2);
      expect(cashea.confirmDownPayment).toHaveBeenCalledWith('777', 23.2);
      expect(payment()).toMatchObject({
        status: PaymentStatus.VERIFIED,
        verifiedByUserId: 'admin-1',
        cashea: { confirmedAmount: 23.2, confirmedAt: expect.any(String) },
      });
      expect(verified).toHaveBeenCalledWith({ orderId: ORDER_ID, paymentId: PAYMENT_ID });
      await expect(service.casheaConfirm(PAYMENT_ID, 'admin-1', 23.2)).rejects.toThrow(
        BadRequestException,
      );
      expect(verified).toHaveBeenCalledTimes(1);
    });

    it('refuses before the buyer finished on Cashea, or for a cancelled order', async () => {
      const unfinished = setup();
      unfinished.seedCashea();
      await expect(unfinished.service.casheaConfirm(PAYMENT_ID, 'admin-1', 20)).rejects.toThrow(
        'El cliente aún no completó la compra en Cashea.',
      );

      const cancelled = setup({ orderStatus: OrderStatus.CANCELLED });
      cancelled.seedCashea({ orderId: '777' });
      await expect(cancelled.service.casheaConfirm(PAYMENT_ID, 'admin-1', 20)).rejects.toThrow(
        BadRequestException,
      );
      expect(cancelled.cashea.confirmDownPayment).not.toHaveBeenCalled();
    });

    it('leaves the payment pending when Cashea refuses, with Cashea’s reason', async () => {
      const { service, seedCashea, cashea, payment, verified } = setup();
      seedCashea({ orderId: '777' });
      cashea.confirmDownPayment.mockRejectedValue(new CasheaError(400, 'Monto inválido'));
      await expect(service.casheaConfirm(PAYMENT_ID, 'admin-1', 20)).rejects.toThrow(
        'Cashea no confirmó la inicial: Monto inválido',
      );
      expect(payment().status).toBe(PaymentStatus.PENDING);
      expect(verified).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    it('cancels the Cashea order when an admin rejects the payment', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea({ orderId: '777' });
      await service.reject(PAYMENT_ID, 'admin-1', 'No pagó la inicial');
      expect(cashea.cancelOrder).toHaveBeenCalledWith('777');
      expect(payment()).toMatchObject({
        status: PaymentStatus.REJECTED,
        rejectionReason: 'No pagó la inicial',
        cashea: { cancelledAt: expect.any(String) },
      });
    });

    it('keeps the payment pending when Cashea won’t cancel', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea({ orderId: '777' });
      cashea.cancelOrder.mockRejectedValue(new CasheaError(503, 'timeout'));
      await expect(service.reject(PAYMENT_ID, 'admin-1', 'x')).rejects.toThrow(
        'Cashea no canceló la orden: timeout',
      );
      expect(payment().status).toBe(PaymentStatus.PENDING);
    });

    it('lets the buyer switch away, unless they already reported paying online', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea({ orderId: '777' });
      await service.withdrawCashea(ORDER_ID);
      expect(cashea.cancelOrder).toHaveBeenCalledWith('777');
      expect(payment().status).toBe(PaymentStatus.REJECTED);

      const paid = setup();
      paid.seedCashea({
        orderId: '777',
        downPayment: {
          atStore: false,
          methodId: 'pago-movil',
          methodLabel: 'Pago móvil',
          amount: 20,
          reportedAt: 'x',
        },
      });
      await expect(paid.service.withdrawCashea(ORDER_ID)).rejects.toThrow(BadRequestException);
      expect(paid.cashea.cancelOrder).not.toHaveBeenCalled();
    });

    it('closes the payment of a cancelled order, recording a Cashea failure for the admin', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea({ orderId: '777' });
      cashea.cancelOrder.mockRejectedValue(new CasheaError(500, 'boom'));
      await service.casheaOrderCancelled(ORDER_ID);
      expect(payment()).toMatchObject({
        status: PaymentStatus.REJECTED,
        rejectionReason: 'Pedido cancelado.',
        cashea: { cancelError: expect.stringContaining('portal de Cashea') },
      });
    });

    it('nothing to cancel at Cashea when the buyer never finished there', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea();
      await service.casheaOrderCancelled(ORDER_ID);
      expect(cashea.cancelOrder).not.toHaveBeenCalled();
      expect(payment().status).toBe(PaymentStatus.REJECTED);
    });

    it('leaves a financed purchase to the admin, with a note', async () => {
      const { service, seedCashea, cashea, payment } = setup();
      seedCashea({ orderId: '777', confirmedAmount: 20 }, PaymentStatus.VERIFIED);
      await service.casheaOrderCancelled(ORDER_ID);
      expect(cashea.cancelOrder).not.toHaveBeenCalled();
      expect(payment()).toMatchObject({
        status: PaymentStatus.VERIFIED,
        cashea: { cancelError: expect.stringContaining('después de confirmar la inicial') },
      });
    });
  });
});

describe('PaymentsService · Cashea public status', () => {
  function build(options: { configured: boolean; enabled?: boolean }) {
    const minAmount = jest.fn().mockResolvedValue(20);
    const list = jest
      .fn()
      .mockResolvedValue(
        options.enabled === undefined
          ? []
          : [{ id: 'cashea', backendMethod: PaymentMethod.CASHEA, enabled: options.enabled }],
      );
    const service = new PaymentsService(
      new FakeFirestore() as never,
      {} as never,
      new EventEmitter2(),
      {} as never,
      { isConfigured: () => options.configured, minAmount } as never,
      { list } as never,
      { get: () => undefined } as never,
    );
    return { service, list };
  }

  it('promotes Cashea online only once it’s configured and switched on', async () => {
    await expect(
      build({ configured: true, enabled: true }).service.casheaPublicStatus(),
    ).resolves.toEqual({
      online: true,
      minAmount: 20,
    });
    await expect(
      build({ configured: true, enabled: false }).service.casheaPublicStatus(),
    ).resolves.toEqual({
      online: false,
      minAmount: null,
    });
    await expect(build({ configured: false }).service.casheaPublicStatus()).resolves.toEqual({
      online: false,
      minAmount: null,
    });
  });

  it('answers repeat visits from memory for a minute', async () => {
    const { service, list } = build({ configured: true, enabled: true });
    await service.casheaPublicStatus();
    await service.casheaPublicStatus();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
