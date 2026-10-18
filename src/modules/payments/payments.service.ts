import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { OrderStatus } from '../orders/entities/order.entity';
import { isStoragePath, UploadsService } from '../uploads/uploads.service';
import {
  MANUAL_RECONCILIATION_METHODS,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from './entities/payment.entity';
import { PayPalClient } from './paypal.client';

export const PAYMENT_VERIFIED_EVENT = 'payment.verified';

export interface PaymentVerifiedEvent {
  orderId: string;
  paymentId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly repo: FirestoreRepository<Payment>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly paypal: PayPalClient,
    private readonly events: EventEmitter2,
    private readonly uploadsService: UploadsService,
  ) {
    this.repo = new FirestoreRepository<Payment>(firestore, Collections.PAYMENTS);
  }

  /** Resolves a stored proof value for API responses — a Storage path becomes
   * a short-lived signed URL; a legacy base64 data URI (from before this
   * migration) passes through untouched. */
  private async withSignedProof(payment: Payment): Promise<Payment> {
    if (!payment.proofUrl || !isStoragePath(payment.proofUrl)) return payment;
    return { ...payment, proofUrl: await this.uploadsService.getSignedProofUrl(payment.proofUrl) };
  }

  /** Mirrors OrdersService's ownership check without depending on OrdersModule
   * (which already depends on PaymentsModule — importing it back would cycle). */
  private async assertOrderAccess(orderId: string, user: AuthenticatedUser): Promise<void> {
    if (user.role === Role.ADMIN) return;
    const orderSnap = await this.firestore.collection(Collections.ORDERS).doc(orderId).get();
    if (!orderSnap.exists || orderSnap.data()?.userId !== user.id) {
      throw new ForbiddenException('This order does not belong to you');
    }
  }

  /** A cancelled order released its stock: a payment confirmed for it
   * would turn it back into a sale of units it no longer holds. */
  private assertOrderNotCancelled(order: { status?: unknown } | undefined): void {
    if (order?.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Este pedido fue cancelado: su pago ya no se puede confirmar.');
    }
  }

  /** Records a manual-reconciliation or credit-B2B payment intent for an order. */
  async initiate(
    orderId: string,
    method: PaymentMethod,
    amount: number,
    reference?: string,
    proofBase64?: string,
  ): Promise<Payment> {
    const isManual = MANUAL_RECONCILIATION_METHODS.includes(method);
    const isCredit = method === PaymentMethod.CREDIT_B2B;

    if (method === PaymentMethod.PAYPAL) {
      const paypalOrder = await this.paypal.createOrder(amount);
      return this.repo.create({
        orderId,
        method,
        amount,
        status: PaymentStatus.PENDING,
        externalReference: paypalOrder.id,
      });
    }

    if (!isManual && !isCredit) {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    const proofUrl = proofBase64
      ? await this.uploadsService.uploadPaymentProof(proofBase64)
      : undefined;

    const saved = await this.repo.create({
      orderId,
      method,
      amount,
      reference,
      proofUrl,
      // Credit B2B is an internally-extended line of credit — it settles on
      // agreed terms, not via upfront verification, so it's auto-verified.
      status: isCredit ? PaymentStatus.VERIFIED : PaymentStatus.PENDING,
      verifiedAt: isCredit ? new Date() : undefined,
    });

    if (isCredit) {
      this.events.emit(PAYMENT_VERIFIED_EVENT, {
        orderId,
        paymentId: saved.id,
      } satisfies PaymentVerifiedEvent);
    }

    return saved;
  }

  async findByOrder(orderId: string, user: AuthenticatedUser): Promise<Payment[]> {
    await this.assertOrderAccess(orderId, user);
    const payments = await this.repo.findAll({
      where: [{ field: 'orderId', op: '==', value: orderId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    return Promise.all(payments.map((p) => this.withSignedProof(p)));
  }

  findById(id: string): Promise<Payment> {
    return this.repo.getOrThrow(id, 'Payment not found');
  }

  /** Admin confirms a manual-reconciliation payment against the bank/wallet statement.
   * Read-check-write runs inside a transaction so two concurrent verify
   * clicks (two admin tabs, a double-submit) can't both pass the PENDING
   * check and each fire PAYMENT_VERIFIED_EVENT — that double-fire would
   * double-enqueue the ERP sale export for the same order. */
  async verifyManual(id: string, adminUserId: string): Promise<Payment> {
    const ref = this.repo.doc(id);
    const saved = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new BadRequestException('Payment not found');
      const payment = { ...snap.data(), id: snap.id } as Payment;
      const orderSnap = await tx.get(
        this.firestore.collection(Collections.ORDERS).doc(payment.orderId),
      );
      this.assertOrderNotCancelled(orderSnap.data());
      // A PayPal charge that PayPal didn't confirm (see capturePaypal) is
      // checked by hand like a bank transfer; any other PayPal payment
      // confirms itself through the capture.
      const paypalUnderReview = payment.method === PaymentMethod.PAYPAL && !!payment.paypalReview;
      if (!MANUAL_RECONCILIATION_METHODS.includes(payment.method) && !paypalUnderReview) {
        throw new BadRequestException('Only manual-reconciliation payments are verified this way');
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`Payment is already ${payment.status}`);
      }
      const patch = {
        status: PaymentStatus.VERIFIED,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
      };
      tx.update(ref, patch);
      return { ...payment, ...patch };
    });
    this.events.emit(PAYMENT_VERIFIED_EVENT, {
      orderId: saved.orderId,
      paymentId: saved.id,
    } satisfies PaymentVerifiedEvent);
    return saved;
  }

  async reject(id: string, adminUserId: string, reason: string): Promise<Payment> {
    const ref = this.repo.doc(id);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new BadRequestException('Payment not found');
      const payment = { ...snap.data(), id: snap.id } as Payment;
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`Payment is already ${payment.status}`);
      }
      const patch = {
        status: PaymentStatus.REJECTED,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
        rejectionReason: reason,
      };
      tx.update(ref, patch);
      return { ...payment, ...patch };
    });
  }

  /** Called after the buyer approves the PayPal order client-side; captures the funds.
   * The capture call itself can't run inside a Firestore transaction (an
   * external network call inside a transaction Firestore may retry is an
   * anti-pattern), so PayPal's own per-order capture exclusivity is what
   * prevents a double charge if two requests race — PayPal accepts exactly
   * one capture per order and errors the other. The transaction below only
   * needs to guarantee *our own* write+event fire at most once: if another
   * concurrent request already settled this payment by the time this one's
   * capture call returns, skip the write/event instead of throwing — the
   * payment did genuinely succeed, just via the other call.
   *
   * The order is paid only when PayPal confirms the charge itself (not just
   * the order) for this payment's exact amount in USD. A charge still under
   * review at PayPal, or for a different amount, leaves the payment pending
   * for an admin: the buyer's money is taken, so their checkout finishes
   * and the order waits for verification like a bank transfer. */
  async capturePaypal(id: string, user: AuthenticatedUser): Promise<Payment> {
    const payment = await this.findById(id);
    await this.assertOrderAccess(payment.orderId, user);
    if (payment.method !== PaymentMethod.PAYPAL || !payment.externalReference) {
      throw new BadRequestException('This payment is not a PayPal payment');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }
    // Checked before charging: once captured, the buyer's money is taken.
    const orderSnap = await this.firestore
      .collection(Collections.ORDERS)
      .doc(payment.orderId)
      .get();
    this.assertOrderNotCancelled(orderSnap.data());
    const result = await this.paypal.captureOrder(payment.externalReference);
    if (result.status !== 'COMPLETED' || !result.capture) {
      throw new BadRequestException(`PayPal order not completed (status: ${result.status})`);
    }
    const { capture } = result;
    if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
      throw new BadRequestException(`PayPal declined the charge (status: ${capture.status})`);
    }
    const confirmed =
      capture.status === 'COMPLETED' &&
      capture.currency === 'USD' &&
      Math.abs(capture.amount - payment.amount) < 0.005;
    if (!confirmed) {
      this.logger.warn(
        `PayPal charge ${capture.id} for payment ${id} needs review: ${capture.status} ${capture.amount} ${capture.currency} (expected ${payment.amount} USD)`,
      );
    }

    const ref = this.repo.doc(id);
    const { saved, verifiedNow } = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = { ...snap.data(), id: snap.id } as Payment;
      if (current.status !== PaymentStatus.PENDING) {
        return { saved: current, verifiedNow: false };
      }
      const patch: Partial<Payment> = confirmed
        ? { status: PaymentStatus.VERIFIED, verifiedAt: new Date(), paypalCaptureId: capture.id }
        : {
            paypalCaptureId: capture.id,
            paypalReview: {
              status: capture.status,
              amount: capture.amount,
              currency: capture.currency,
            },
          };
      tx.update(ref, patch);
      return { saved: { ...current, ...patch }, verifiedNow: confirmed };
    });

    if (verifiedNow) {
      this.events.emit(PAYMENT_VERIFIED_EVENT, {
        orderId: saved.orderId,
        paymentId: saved.id,
      } satisfies PaymentVerifiedEvent);
    }
    return saved;
  }
}
