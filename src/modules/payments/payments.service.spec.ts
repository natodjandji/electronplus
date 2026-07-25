import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaymentsService } from './payments.service';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';

/** Regression tests for the IDOR fix: /payments/order/:orderId and
 * /payments/:id/paypal/capture had no ownership check at all — any
 * authenticated client could read or force-capture another user's payment.
 * Also covers the status-transition guards (verify/reject/capture can't
 * act on a payment that already left "pending"). */
describe('PaymentsService', () => {
  const owner: AuthenticatedUser = { id: 'user-1', email: 'owner@test.com', role: Role.CLIENT };
  const intruder: AuthenticatedUser = {
    id: 'user-2',
    email: 'intruder@test.com',
    role: Role.CLIENT,
  };
  const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@test.com', role: Role.ADMIN };
  const orderId = 'order-1';
  const paymentId = 'payment-1';

  function buildService(firestore: FakeFirestore, paypal: Record<string, jest.Mock> = {}) {
    return new PaymentsService(
      firestore as unknown as ConstructorParameters<typeof PaymentsService>[0],
      paypal as unknown as ConstructorParameters<typeof PaymentsService>[1],
      new EventEmitter2(),
    );
  }

  function seedOrder(firestore: FakeFirestore) {
    firestore.seed(Collections.ORDERS, orderId, { userId: owner.id });
  }

  function seedPayment(firestore: FakeFirestore, overrides: Record<string, unknown> = {}) {
    firestore.seed(Collections.PAYMENTS, paymentId, {
      orderId,
      method: PaymentMethod.BANK_TRANSFER,
      amount: 100,
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  describe('findByOrder', () => {
    it('rejects a request from a user who does not own the order', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      const service = buildService(firestore);

      await expect(service.findByOrder(orderId, intruder)).rejects.toThrow(ForbiddenException);
    });

    it('allows the order owner', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      const service = buildService(firestore);

      await expect(service.findByOrder(orderId, owner)).resolves.toEqual([]);
    });

    it('allows an admin regardless of ownership', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      const service = buildService(firestore);

      await expect(service.findByOrder(orderId, admin)).resolves.toEqual([]);
    });
  });

  describe('capturePaypal', () => {
    it('rejects a request from a user who does not own the order', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      seedPayment(firestore, { method: PaymentMethod.PAYPAL, externalReference: 'ext-1' });
      const service = buildService(firestore, {
        captureOrder: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      });

      await expect(service.capturePaypal(paymentId, intruder)).rejects.toThrow(ForbiddenException);
    });

    it('rejects capturing a payment that already left pending', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      seedPayment(firestore, {
        method: PaymentMethod.PAYPAL,
        externalReference: 'ext-1',
        status: PaymentStatus.VERIFIED,
      });
      const captureOrder = jest.fn().mockResolvedValue({ status: 'COMPLETED' });
      const service = buildService(firestore, { captureOrder });

      await expect(service.capturePaypal(paymentId, owner)).rejects.toThrow(BadRequestException);
      // Must not re-hit PayPal for a payment that's already been decided.
      expect(captureOrder).not.toHaveBeenCalled();
    });

    it('captures for the order owner', async () => {
      const firestore = new FakeFirestore();
      seedOrder(firestore);
      seedPayment(firestore, { method: PaymentMethod.PAYPAL, externalReference: 'ext-1' });
      const service = buildService(firestore, {
        captureOrder: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      });

      const result = await service.capturePaypal(paymentId, owner);
      expect(result.status).toBe(PaymentStatus.VERIFIED);
    });
  });

  describe('verifyManual', () => {
    it('rejects re-verifying a payment that already left pending', async () => {
      const firestore = new FakeFirestore();
      seedPayment(firestore, { status: PaymentStatus.VERIFIED });
      const service = buildService(firestore);

      await expect(service.verifyManual(paymentId, admin.id)).rejects.toThrow(BadRequestException);
    });

    it('verifies a pending manual-reconciliation payment', async () => {
      const firestore = new FakeFirestore();
      seedPayment(firestore);
      const service = buildService(firestore);

      const result = await service.verifyManual(paymentId, admin.id);
      expect(result.status).toBe(PaymentStatus.VERIFIED);
    });
  });

  describe('reject', () => {
    it('rejects re-rejecting a payment that already left pending', async () => {
      const firestore = new FakeFirestore();
      seedPayment(firestore, { status: PaymentStatus.REJECTED });
      const service = buildService(firestore);

      await expect(service.reject(paymentId, admin.id, 'bad reference')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a pending payment with a reason', async () => {
      const firestore = new FakeFirestore();
      seedPayment(firestore);
      const service = buildService(firestore);

      const result = await service.reject(paymentId, admin.id, 'bad reference');
      expect(result.status).toBe(PaymentStatus.REJECTED);
      expect(result.rejectionReason).toBe('bad reference');
    });
  });
});
