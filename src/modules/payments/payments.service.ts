import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { round2 } from '../../common/utils/money';
import { EnvConfig } from '../../config/env.validation';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { FulfillmentMethod, Order, OrderStatus } from '../orders/entities/order.entity';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { isStoragePath, UploadsService } from '../uploads/uploads.service';
import { CasheaClient, CasheaError } from './cashea.client';
import { buildCasheaPayload, casheaPayloadTotal } from './cashea-payload';
import {
  CasheaDownPayment,
  CasheaPayment,
  MANUAL_RECONCILIATION_METHODS,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from './entities/payment.entity';
import { PayPalClient } from './paypal.client';

/** Emitted with emitAsync and awaited: its listener marks the order paid,
 * and on Cloud Run work left running after the response may never finish
 * (the instance loses its CPU), leaving a verified payment on an order
 * still waiting for payment. */
export const PAYMENT_VERIFIED_EVENT = 'payment.verified';
const CASHEA_STATUS_TTL_MS = 60_000;

export interface PaymentVerifiedEvent {
  orderId: string;
  paymentId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly repo: FirestoreRepository<Payment>;
  private casheaStatusCache?: {
    value: { online: boolean; minAmount: number | null };
    at: number;
  };

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly paypal: PayPalClient,
    private readonly events: EventEmitter2,
    private readonly uploadsService: UploadsService,
    private readonly cashea: CasheaClient,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.repo = new FirestoreRepository<Payment>(firestore, Collections.PAYMENTS);
  }

  /** Resolves a stored proof value for API responses — a Storage path becomes
   * a short-lived signed URL; a legacy base64 data URI (from before this
   * migration) passes through untouched. */
  private async withSignedProof(payment: Payment): Promise<Payment> {
    const sign = async (value: string | undefined) =>
      value && isStoragePath(value) ? this.uploadsService.getSignedProofUrl(value) : value;
    const downPayment = payment.cashea?.downPayment;
    return {
      ...payment,
      proofUrl: await sign(payment.proofUrl),
      ...(downPayment &&
        !downPayment.atStore && {
          cashea: {
            ...payment.cashea!,
            downPayment: { ...downPayment, proofUrl: await sign(downPayment.proofUrl) },
          },
        }),
    };
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

  /** Refuses a method the store doesn't offer: the API takes the method
   * from the request, so without this one switched off in the
   * payment-methods panel could still be used. Checked before the order
   * reserves any stock. */
  async assertMethodOffered(method: PaymentMethod): Promise<void> {
    const offered = (await this.paymentMethods.list()).some(
      (m) => m.enabled && m.backendMethod === method,
    );
    if (!offered) {
      throw new BadRequestException('Ese método de pago no está disponible. Elige otro.');
    }
  }

  /** Records a manual-reconciliation payment intent for an order (or starts
   * its PayPal or Cashea checkout). */
  async initiate(
    orderId: string,
    method: PaymentMethod,
    amount: number,
    reference?: string,
    proofBase64?: string,
  ): Promise<Payment> {
    const isManual = MANUAL_RECONCILIATION_METHODS.includes(method);

    if (method === PaymentMethod.CASHEA) return this.startCashea(orderId);

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

    if (!isManual) {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    const proofUrl = proofBase64
      ? await this.uploadsService.uploadPaymentProof(proofBase64)
      : undefined;

    return this.repo.create({
      orderId,
      method,
      amount,
      reference,
      proofUrl,
      status: PaymentStatus.PENDING,
    });
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
    await this.events.emitAsync(PAYMENT_VERIFIED_EVENT, {
      orderId: saved.orderId,
      paymentId: saved.id,
    } satisfies PaymentVerifiedEvent);
    return saved;
  }

  async reject(id: string, adminUserId: string, reason: string): Promise<Payment> {
    const ref = this.repo.doc(id);
    // A rejected Cashea payment mustn't leave the buyer's Cashea order
    // standing; cancelled there first, so a failure stops the rejection.
    const before = await this.findById(id);
    const cashea =
      before.status === PaymentStatus.PENDING
        ? await this.cancelCasheaFor(before, { strict: true })
        : undefined;
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
        ...(cashea && { cashea }),
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
      await this.events.emitAsync(PAYMENT_VERIFIED_EVENT, {
        orderId: saved.orderId,
        paymentId: saved.id,
      } satisfies PaymentVerifiedEvent);
    }
    return saved;
  }

  // --- Cashea ----------------------------------------------------------

  /** Whether buyers can pay with Cashea on the web right now (credentials
   * set and the method switched on) — what the storefront's Cashea banner
   * says depends on it. Kept for a minute: every catalog visit asks. */
  async casheaPublicStatus(): Promise<{ online: boolean; minAmount: number | null }> {
    const cached = this.casheaStatusCache;
    if (cached && Date.now() - cached.at < CASHEA_STATUS_TTL_MS) return cached.value;
    let value: { online: boolean; minAmount: number | null } = { online: false, minAmount: null };
    if (this.cashea.isConfigured()) {
      const method = (await this.paymentMethods.list()).find(
        (m) => m.backendMethod === PaymentMethod.CASHEA,
      );
      value = {
        online: Boolean(method?.enabled),
        minAmount: method?.enabled ? await this.cashea.minAmount() : null,
      };
    }
    this.casheaStatusCache = { value, at: Date.now() };
    return value;
  }

  /** What checkout needs to offer Cashea. */
  async casheaConfig(): Promise<{ available: boolean; minAmount: number | null }> {
    if (!this.cashea.isConfigured()) return { available: false, minAmount: null };
    return { available: true, minAmount: await this.cashea.minAmount() };
  }

  /** Creates the buyer's checkout on Cashea from the stored order: the
   * buyer finishes it on Cashea's site and comes back to
   * /cashea/retorno/{orderId}. */
  private async startCashea(orderId: string): Promise<Payment> {
    if (!this.cashea.isConfigured()) {
      throw new BadRequestException('Cashea no está disponible en este momento.');
    }
    const orderSnap = await this.firestore.collection(Collections.ORDERS).doc(orderId).get();
    const order = { ...orderSnap.data(), id: orderId } as Order;
    const minAmount = await this.cashea.minAmount();
    if (minAmount !== null && order.totalAmount < minAmount) {
      throw new BadRequestException(
        `Cashea requiere una compra mínima de $${minAmount.toFixed(2)}.`,
      );
    }
    const site = this.config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, '');
    const payload = buildCasheaPayload(order, await this.productDetails(order), {
      redirectUrl: `${site}/cashea/retorno/${encodeURIComponent(orderId)}`,
      merchantName: this.config.get('CASHEA_MERCHANT_NAME', { infer: true }),
      externalClientId: this.config.get('CASHEA_EXTERNAL_CLIENT_ID', { infer: true })!,
      storeId: this.config.get('CASHEA_STORE_ID', { infer: true })!,
      storeName: this.config.get('CASHEA_STORE_NAME', { infer: true }),
      fallbackImageUrl: `${site}/og-image.jpg`,
    });
    const { payloadId, checkoutUrl } = await this.cashea.createCheckout(payload);
    return this.repo.create({
      orderId,
      method: PaymentMethod.CASHEA,
      amount: order.totalAmount,
      status: PaymentStatus.PENDING,
      externalReference: String(payloadId),
      cashea: { payloadId, checkoutUrl, total: casheaPayloadTotal(payload) },
    });
  }

  /** Photos and descriptions for Cashea's checkout; the order keeps only
   * names and prices. */
  private async productDetails(order: Order) {
    const refs = [...new Set(order.items.map((i) => i.productId))].map((id) =>
      this.firestore.collection(Collections.PRODUCTS).doc(id),
    );
    const snaps = refs.length ? await this.firestore.getAll(...refs) : [];
    return new Map(
      snaps.map((snap) => {
        const data = snap.data() as { imageUrl?: string; specs?: string } | undefined;
        return [snap.id, { imageUrl: data?.imageUrl, specs: data?.specs }];
      }),
    );
  }

  /** The order's live Cashea payment (its latest payment), or an error. */
  private async pendingCasheaPayment(orderId: string): Promise<Payment> {
    const [payment] = await this.repo.findAll({
      where: [{ field: 'orderId', op: '==', value: orderId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 1,
    });
    if (payment?.method !== PaymentMethod.CASHEA || !payment.cashea) {
      throw new BadRequestException('Este pedido no se está pagando con Cashea.');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Este pago con Cashea ya no está pendiente.');
    }
    return payment;
  }

  /** The buyer is back from Cashea with the order approved: Cashea's order
   * number is recorded. Coming back twice is harmless; a different number
   * for the same purchase isn't accepted. */
  async casheaReturn(orderId: string, idNumber: string, user: AuthenticatedUser): Promise<Payment> {
    await this.assertOrderAccess(orderId, user);
    const casheaOrderId = idNumber.trim();
    if (!/^\d{1,20}$/.test(casheaOrderId)) {
      throw new BadRequestException('Cashea no devolvió un número de orden válido.');
    }
    const { id } = await this.pendingCasheaPayment(orderId);
    const ref = this.repo.doc(id);
    const saved = await this.firestore.runTransaction(async (tx) => {
      const current = { ...(await tx.get(ref)).data(), id } as Payment;
      const cashea = current.cashea!;
      if (cashea.orderId === casheaOrderId) return current;
      if (cashea.orderId) {
        throw new BadRequestException('Esta compra ya está asociada a otra orden de Cashea.');
      }
      const next: CasheaPayment = {
        ...cashea,
        orderId: casheaOrderId,
        returnedAt: new Date().toISOString(),
      };
      tx.update(ref, { cashea: next });
      return { ...current, cashea: next };
    });
    return this.withSignedProof(saved);
  }

  /** The buyer reports the down payment: paid online through one of the
   * store's payment methods, or to be paid at the store (pickup orders).
   * It can be reported again while the store hasn't confirmed it. */
  async casheaReportDownPayment(
    paymentId: string,
    user: AuthenticatedUser,
    report: {
      atStore: boolean;
      methodId?: string;
      amount?: number;
      reference?: string;
      proofBase64?: string;
    },
  ): Promise<Payment> {
    const payment = await this.findById(paymentId);
    await this.assertOrderAccess(payment.orderId, user);
    const current = await this.pendingCasheaPayment(payment.orderId);
    if (current.id !== paymentId) {
      throw new BadRequestException('Este pago con Cashea ya no está vigente.');
    }
    if (!current.cashea!.orderId) {
      throw new BadRequestException('Primero completa la compra en Cashea.');
    }
    const order = await this.loadOrder(payment.orderId);
    this.assertOrderNotCancelled(order);

    let downPayment: CasheaDownPayment;
    if (report.atStore) {
      if (order.fulfillmentMethod !== FulfillmentMethod.PICKUP) {
        throw new BadRequestException(
          'La inicial en tienda es solo para pedidos con retiro en tienda.',
        );
      }
      downPayment = { atStore: true, reportedAt: new Date().toISOString() };
    } else {
      const method = report.methodId
        ? await this.paymentMethods.findById(report.methodId)
        : undefined;
      const online =
        method?.enabled &&
        MANUAL_RECONCILIATION_METHODS.includes(method.backendMethod) &&
        method.backendMethod !== PaymentMethod.CASH;
      if (!method || !online) {
        throw new BadRequestException('Elige cómo pagaste la inicial.');
      }
      const amount = round2(Number(report.amount));
      if (!(amount > 0) || amount >= order.totalAmount) {
        throw new BadRequestException('Indica el monto de la inicial que pagaste.');
      }
      const reference = report.reference?.trim() || undefined;
      if (method.needsReference && !reference) {
        throw new BadRequestException('Indica la referencia del pago de la inicial.');
      }
      const proofUrl = report.proofBase64
        ? await this.uploadsService.uploadPaymentProof(report.proofBase64)
        : undefined;
      downPayment = {
        atStore: false,
        methodId: method.id,
        methodLabel: method.label,
        amount,
        ...(reference && { reference }),
        ...(proofUrl && { proofUrl }),
        reportedAt: new Date().toISOString(),
      };
    }

    const ref = this.repo.doc(paymentId);
    const saved = await this.firestore.runTransaction(async (tx) => {
      const latest = { ...(await tx.get(ref)).data(), id: paymentId } as Payment;
      if (latest.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Este pago con Cashea ya no está pendiente.');
      }
      const cashea: CasheaPayment = { ...latest.cashea!, downPayment };
      tx.update(ref, { cashea });
      return { ...latest, cashea };
    });
    return this.withSignedProof(saved);
  }

  /** The store received the down payment: it's confirmed to Cashea, which
   * finances the rest, and the order is paid. Cashea is called before the
   * write (a network call can't sit inside a transaction Firestore may
   * retry); a second click finds the payment verified and changes nothing. */
  async casheaConfirm(paymentId: string, adminUserId: string, rawAmount: number): Promise<Payment> {
    const payment = await this.findById(paymentId);
    if (payment.method !== PaymentMethod.CASHEA || !payment.cashea) {
      throw new BadRequestException('Este pago no es con Cashea.');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`El pago ya está ${payment.status}.`);
    }
    const casheaOrderId = payment.cashea.orderId;
    if (!casheaOrderId) {
      throw new BadRequestException('El cliente aún no completó la compra en Cashea.');
    }
    const order = await this.loadOrder(payment.orderId);
    this.assertOrderNotCancelled(order);
    const amount = round2(Number(rawAmount));
    if (!(amount > 0) || amount > order.totalAmount) {
      throw new BadRequestException('Indica el monto de la inicial que recibiste.');
    }
    try {
      await this.cashea.confirmDownPayment(casheaOrderId, amount);
    } catch (error) {
      throw this.casheaFailure('Cashea no confirmó la inicial', error);
    }

    const ref = this.repo.doc(paymentId);
    const { saved, verifiedNow } = await this.firestore.runTransaction(async (tx) => {
      const current = { ...(await tx.get(ref)).data(), id: paymentId } as Payment;
      if (current.status !== PaymentStatus.PENDING) {
        return { saved: current, verifiedNow: false };
      }
      const patch: Partial<Payment> = {
        status: PaymentStatus.VERIFIED,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
        cashea: {
          ...current.cashea!,
          confirmedAmount: amount,
          confirmedAt: new Date().toISOString(),
        },
      };
      tx.update(ref, patch);
      return { saved: { ...current, ...patch }, verifiedNow: true };
    });
    if (verifiedNow) {
      await this.events.emitAsync(PAYMENT_VERIFIED_EVENT, {
        orderId: saved.orderId,
        paymentId: saved.id,
      } satisfies PaymentVerifiedEvent);
    }
    return this.withSignedProof(saved);
  }

  /** The buyer switches away from a Cashea payment the store hasn't
   * confirmed: its Cashea order is cancelled and the payment closed, so a
   * new method can be chosen. Not once a down payment was reported online
   * — that money has to be sorted out with the store first. */
  async withdrawCashea(orderId: string): Promise<void> {
    const payment = await this.pendingCasheaPayment(orderId);
    if (payment.cashea?.downPayment && !payment.cashea.downPayment.atStore) {
      throw new BadRequestException(
        'Ya reportaste el pago de la inicial: escríbenos para cambiar el método de pago.',
      );
    }
    const cashea = await this.cancelCasheaFor(payment, { strict: true });
    await this.repo.update(payment.id, {
      status: PaymentStatus.REJECTED,
      rejectionReason: 'El cliente cambió el método de pago.',
      verifiedAt: new Date(),
      ...(cashea && { cashea }),
    });
  }

  /** The order was cancelled: its pending Cashea payment is cancelled at
   * Cashea and closed. A failure is recorded on the payment for the admin
   * (the order is already cancelled either way); a payment Cashea already
   * financed is left for the admin to reverse in Cashea's portal. */
  async casheaOrderCancelled(orderId: string): Promise<void> {
    const [payment] = await this.repo.findAll({
      where: [{ field: 'orderId', op: '==', value: orderId }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 1,
    });
    if (payment?.method !== PaymentMethod.CASHEA || !payment.cashea) return;
    if (payment.status === PaymentStatus.VERIFIED) {
      this.logger.warn(
        `Order ${orderId} was cancelled after its Cashea down payment was confirmed (Cashea order ${payment.cashea.orderId}).`,
      );
      await this.repo.update(payment.id, {
        cashea: {
          ...payment.cashea,
          cancelError:
            'El pedido se canceló después de confirmar la inicial: anula la orden en el portal de Cashea.',
        },
      });
      return;
    }
    if (payment.status !== PaymentStatus.PENDING) return;
    const cashea = await this.cancelCasheaFor(payment, { strict: false });
    await this.repo.update(payment.id, {
      status: PaymentStatus.REJECTED,
      rejectionReason: 'Pedido cancelado.',
      verifiedAt: new Date(),
      ...(cashea && { cashea }),
    });
  }

  /** Cancels the Cashea order behind a payment, when there is one (a buyer
   * who never finished on Cashea left nothing to cancel). Returns the
   * payment's Cashea record as it now stands; `strict` throws instead of
   * recording a failure. */
  private async cancelCasheaFor(
    payment: Payment,
    { strict }: { strict: boolean },
  ): Promise<CasheaPayment | undefined> {
    if (payment.method !== PaymentMethod.CASHEA || !payment.cashea) return undefined;
    const now = new Date().toISOString();
    if (!payment.cashea.orderId || payment.cashea.cancelledAt) {
      return { ...payment.cashea, cancelledAt: payment.cashea.cancelledAt ?? now };
    }
    try {
      await this.cashea.cancelOrder(payment.cashea.orderId);
      const { cancelError: _cancelError, ...rest } = payment.cashea;
      return { ...rest, cancelledAt: now };
    } catch (error) {
      if (strict) throw this.casheaFailure('Cashea no canceló la orden', error);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Could not cancel Cashea order ${payment.cashea.orderId} for order ${payment.orderId}: ${message}`,
      );
      return {
        ...payment.cashea,
        cancelError: `No se pudo cancelar en Cashea (${message}): anúlala en el portal de Cashea.`,
      };
    }
  }

  private casheaFailure(what: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof CasheaError ? error.status : 500;
    return status >= 500
      ? new BadGatewayException(`${what}: ${message}`)
      : new BadRequestException(`${what}: ${message}`);
  }

  private async loadOrder(orderId: string): Promise<Order> {
    const snap = await this.firestore.collection(Collections.ORDERS).doc(orderId).get();
    if (!snap.exists) throw new BadRequestException('Order not found');
    return { ...snap.data(), id: orderId } as Order;
  }
}
