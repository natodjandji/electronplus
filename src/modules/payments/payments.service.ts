import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
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
      if (!MANUAL_RECONCILIATION_METHODS.includes(payment.method)) {
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
   * concurrent request already flipped this payment to VERIFIED by the time
   * this one's capture call returns, skip the write/event instead of
   * throwing — the payment did genuinely succeed, just via the other call. */
  async capturePaypal(id: string, user: AuthenticatedUser): Promise<Payment> {
    const payment = await this.findById(id);
    await this.assertOrderAccess(payment.orderId, user);
    if (payment.method !== PaymentMethod.PAYPAL || !payment.externalReference) {
      throw new BadRequestException('This payment is not a PayPal payment');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }
    const result = await this.paypal.captureOrder(payment.externalReference);
    if (result.status !== 'COMPLETED') {
      throw new BadRequestException(`PayPal order not completed (status: ${result.status})`);
    }

    const ref = this.repo.doc(id);
    const { saved, alreadyVerified } = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = { ...snap.data(), id: snap.id } as Payment;
      if (current.status !== PaymentStatus.PENDING) {
        return { saved: current, alreadyVerified: true };
      }
      const patch = { status: PaymentStatus.VERIFIED, verifiedAt: new Date() };
      tx.update(ref, patch);
      return { saved: { ...current, ...patch }, alreadyVerified: false };
    });

    if (!alreadyVerified) {
      this.events.emit(PAYMENT_VERIFIED_EVENT, {
        orderId: saved.orderId,
        paymentId: saved.id,
      } satisfies PaymentVerifiedEvent);
    }
    return saved;
  }
}
