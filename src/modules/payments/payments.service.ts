import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { MANUAL_RECONCILIATION_METHODS, Payment, PaymentMethod, PaymentStatus } from './entities/payment.entity';
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
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly paypal: PayPalClient,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Payment>(firestore, Collections.PAYMENTS);
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

    const saved = await this.repo.create({
      orderId,
      method,
      amount,
      reference,
      proofUrl: proofBase64,
      // Credit B2B is an internally-extended line of credit — it settles on
      // agreed terms, not via upfront verification, so it's auto-verified.
      status: isCredit ? PaymentStatus.VERIFIED : PaymentStatus.PENDING,
      verifiedAt: isCredit ? new Date() : undefined,
    });

    if (isCredit) {
      this.events.emit(PAYMENT_VERIFIED_EVENT, { orderId, paymentId: saved.id } satisfies PaymentVerifiedEvent);
    }

    return saved;
  }

  findByOrder(orderId: string): Promise<Payment[]> {
    return this.repo.findAll({
      where: [{ field: 'orderId', op: '==', value: orderId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
  }

  findById(id: string): Promise<Payment> {
    return this.repo.getOrThrow(id, 'Payment not found');
  }

  /** Admin confirms a manual-reconciliation payment against the bank/wallet statement. */
  async verifyManual(id: string, adminUserId: string): Promise<Payment> {
    const payment = await this.findById(id);
    if (!MANUAL_RECONCILIATION_METHODS.includes(payment.method)) {
      throw new BadRequestException('Only manual-reconciliation payments are verified this way');
    }
    const saved = await this.repo.update(id, {
      status: PaymentStatus.VERIFIED,
      verifiedByUserId: adminUserId,
      verifiedAt: new Date(),
    });
    this.events.emit(PAYMENT_VERIFIED_EVENT, { orderId: saved.orderId, paymentId: saved.id } satisfies PaymentVerifiedEvent);
    return saved;
  }

  async reject(id: string, adminUserId: string, reason: string): Promise<Payment> {
    return this.repo.update(id, {
      status: PaymentStatus.REJECTED,
      verifiedByUserId: adminUserId,
      verifiedAt: new Date(),
      rejectionReason: reason,
    });
  }

  /** Called after the buyer approves the PayPal order client-side; captures the funds. */
  async capturePaypal(id: string): Promise<Payment> {
    const payment = await this.findById(id);
    if (payment.method !== PaymentMethod.PAYPAL || !payment.externalReference) {
      throw new BadRequestException('This payment is not a PayPal payment');
    }
    const result = await this.paypal.captureOrder(payment.externalReference);
    if (result.status !== 'COMPLETED') {
      throw new BadRequestException(`PayPal order not completed (status: ${result.status})`);
    }
    const saved = await this.repo.update(id, { status: PaymentStatus.VERIFIED, verifiedAt: new Date() });
    this.events.emit(PAYMENT_VERIFIED_EVENT, { orderId: saved.orderId, paymentId: saved.id } satisfies PaymentVerifiedEvent);
    return saved;
  }
}
