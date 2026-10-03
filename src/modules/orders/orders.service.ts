import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { newestFirst, periodWhere } from '../../common/dto/period-query.dto';
import { FirestoreRepository, WhereClause } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { Payment, PaymentMethod, PaymentStatus } from '../payments/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../products/pricing.service';
import { ProductsService, StockChangedEvent } from '../products/products.service';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { QuotesService } from '../quotes/quotes.service';
import { ShippingRatesService } from '../shipping-rates/shipping-rates.service';
import { CreateOrderFromQuoteDto } from './dto/create-order-from-quote.dto';
import { CreateOrderDto, ShippingInfoDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { RetryPaymentDto } from './dto/retry-payment.dto';
import {
  fulfillmentPipeline,
  FulfillmentMethod,
  Order,
  OrderItem,
  OrderStatus,
} from './entities/order.entity';

export const ORDER_PAID_EVENT = 'order.paid';
/** Fires once an order survives payment initiation (see create()/
 * createFromQuote()) — not at the top of the transaction, so a payment
 * failure that triggers compensate() never emails a customer about an
 * order that got rolled back. */
export const ORDER_CREATED_EVENT = 'order.created';
/** Fires on every fulfillment-pipeline transition (markPaid, advanceStatus)
 * so email/notifications can react without those methods knowing about
 * either concern. */
export const ORDER_STATUS_CHANGED_EVENT = 'order.status_changed';
/** Venezuela's standard IVA rate — applied to (subtotal - discount). */
const TAX_RATE = 0.16;
/** Every order reserves its stock until an admin verifies or cancels it,
 * and sign-up is open — without a cap, one account could hold the whole
 * inventory with orders it never pays. */
const MAX_UNPAID_ORDERS_PER_CLIENT = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OrderPaidEvent {
  orderId: string;
}

export interface OrderCreatedEvent {
  orderId: string;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  status: OrderStatus;
}

@Injectable()
export class OrdersService {
  private readonly repo: FirestoreRepository<Order>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
    private readonly paymentsService: PaymentsService,
    private readonly shippingRatesService: ShippingRatesService,
    private readonly discountCodesService: DiscountCodesService,
    private readonly quotesService: QuotesService,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Order>(firestore, Collections.ORDERS);
  }

  /** Pickup orders skip delivery entirely; delivery orders need a real
   * address so the shipping-rates lookup has somewhere to quote. */
  private async resolveShippingCost(
    fulfillmentMethod: FulfillmentMethod,
    shipping: ShippingInfoDto,
  ): Promise<number> {
    if (fulfillmentMethod === FulfillmentMethod.PICKUP) return 0;
    if (!shipping.address || !shipping.city || !shipping.state) {
      throw new BadRequestException('address, city and state are required for delivery orders');
    }
    const { amount } = await this.shippingRatesService.quote(shipping.state, shipping.city);
    return amount;
  }

  private async assertCanOpenOrder(user: AuthenticatedUser): Promise<void> {
    if (user.role !== Role.CLIENT) return;
    const unpaid = await this.repo.count([
      { field: 'userId', op: '==', value: user.id },
      { field: 'status', op: '==', value: OrderStatus.PENDING_PAYMENT_VERIFICATION },
    ]);
    if (unpaid >= MAX_UNPAID_ORDERS_PER_CLIENT) {
      throw new ConflictException(
        `Tienes ${unpaid} pedidos esperando verificación de pago. Completa o cancela alguno antes de crear otro.`,
      );
    }
  }

  /** Credit B2B is marked paid on the spot — there's no payment to check —
   * so it's only for accounts an admin granted a credit line (creditLimit
   * on PATCH /users/:id), and only up to it. Resolves the line for that
   * method, undefined for every other. */
  private async creditLineFor(userId: string, method: PaymentMethod): Promise<number | undefined> {
    if (method !== PaymentMethod.CREDIT_B2B) return undefined;
    const snap = await this.firestore.collection(Collections.USERS).doc(userId).get();
    const creditLimit = Number(snap.data()?.creditLimit ?? 0);
    if (!(creditLimit > 0)) {
      throw new ForbiddenException(
        'Tu cuenta no tiene una línea de crédito aprobada. Elige otro método de pago.',
      );
    }
    return creditLimit;
  }

  private assertWithinCreditLine(creditLine: number | undefined, totalAmount: number): void {
    if (creditLine !== undefined && totalAmount > creditLine) {
      throw new ForbiddenException(
        'El total del pedido supera tu línea de crédito. Elige otro método de pago.',
      );
    }
  }

  async create(user: AuthenticatedUser, dto: CreateOrderDto): Promise<Order> {
    await this.assertCanOpenOrder(user);
    const creditLine = await this.creditLineFor(user.id, dto.paymentMethod);
    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Duplicate product in order items — merge quantities into a single line instead',
      );
    }

    const { orderId, stockChanges } = await this.firestore.runTransaction(async (tx) => {
      // Phase 1 — ALL reads (Firestore requires every read in a transaction
      // to happen before any write). One getAll() round trip for every line
      // instead of N sequential tx.get() calls.
      const productsById = await this.productsService.getForUpdateMany(
        tx,
        dto.items.map((line) => line.productId),
      );
      const reads = dto.items.map((line) => productsById.get(line.productId)!);
      const redeemDiscount = dto.discountCode
        ? await this.discountCodesService.beginRedemption(tx, dto.discountCode)
        : undefined;

      // Phase 2 — ALL writes.
      let subtotal = 0;
      const items: OrderItem[] = [];
      const stockChanges: StockChangedEvent[] = [];

      reads.forEach(({ ref, product }, idx) => {
        const line = dto.items[idx];
        this.productsService.assertPurchasable(product);
        const nextStock = this.productsService.reserveStock(tx, ref, product, line.qty);
        const unitPrice = this.pricingService.priceFor(product);
        const lineTotal = unitPrice * line.qty;
        subtotal += lineTotal;
        items.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          categoryLabel: product.category.label,
          qty: line.qty,
          unitPrice,
          unitCost: product.cost,
          lineTotal,
        });
        stockChanges.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          stock: nextStock,
          minStockThreshold: product.minStockThreshold,
        });
      });

      let discountCode: string | undefined;
      let discountAmount = 0;
      if (redeemDiscount) {
        ({ code: discountCode, discountAmount } = redeemDiscount(subtotal));
      }

      const taxableBase = subtotal - discountAmount;
      const taxAmount = round2(taxableBase * TAX_RATE);
      const fulfillmentMethod = dto.fulfillmentMethod ?? FulfillmentMethod.DELIVERY;
      const shippingCost = await this.resolveShippingCost(fulfillmentMethod, dto.shipping);
      const totalAmount = round2(taxableBase + taxAmount + shippingCost);
      this.assertWithinCreditLine(creditLine, totalAmount);

      const orderRef = this.repo.collection().doc();
      const now = FieldValue.serverTimestamp();
      tx.set(orderRef, {
        userId: user.id,
        status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
        paymentMethod: dto.paymentMethod,
        fulfillmentMethod,
        subtotal,
        taxAmount,
        shippingCost,
        discountCode,
        discountAmount,
        totalAmount,
        shippingFullName: dto.shipping.fullName,
        shippingPhone: dto.shipping.phone,
        shippingTaxId: dto.shipping.taxId,
        shippingAddress: dto.shipping.address,
        shippingCity: dto.shipping.city,
        shippingState: dto.shipping.state,
        items,
        createdAt: now,
        updatedAt: now,
      });

      return { orderId: orderRef.id, stockChanges };
    });

    await this.productsService.stockCommitted(stockChanges);
    const order = await this.repo.getOrThrow(orderId);

    let payment: Payment;
    try {
      payment = await this.paymentsService.initiate(
        order.id,
        dto.paymentMethod,
        order.totalAmount,
        dto.paymentReference,
        dto.paymentProofBase64,
      );
    } catch (error) {
      // Payment initiation failed after stock was committed (e.g. PayPal
      // unreachable) — restore the reserved stock and drop the order rather
      // than leaving a paid-for-nothing reservation.
      await this.compensate(order);
      throw new BadGatewayException(
        `Could not initiate payment for the order, it was cancelled: ${(error as Error).message}`,
      );
    }

    this.events.emit(ORDER_CREATED_EVENT, { orderId: order.id } satisfies OrderCreatedEvent);

    // Credit-B2B is auto-verified synchronously by PaymentsService — reflect
    // that on the order immediately instead of relying on the fire-and-forget
    // event listener to have run before we respond.
    if (payment.status === PaymentStatus.VERIFIED) {
      return this.markPaid(order.id);
    }
    return this.findById(order.id, user);
  }

  /** Checks an approved quote out into a real order — item prices come from
   * the quote's negotiated discount (unitPrice/discountPct + globalDiscountPct)
   * instead of standard pricing, exactly like the customer agreed with the admin.
   * Stock is re-verified for real here (the quote builder can only warn about it). */
  async createFromQuote(
    quoteId: string,
    user: AuthenticatedUser,
    dto: CreateOrderFromQuoteDto,
  ): Promise<Order> {
    const quote = await this.quotesService.findOneForUser(quoteId, user);
    await this.assertCanOpenOrder(user);
    const creditLine = await this.creditLineFor(user.id, dto.paymentMethod);
    if (quote.status !== QuoteStatus.APPROVED) {
      throw new BadRequestException('Only an approved quote can be checked out');
    }
    if (quote.convertedOrderId) {
      throw new BadRequestException('This quote was already converted to an order');
    }
    if (quote.items.length === 0) {
      throw new BadRequestException('This quote has no items');
    }

    const quoteRef = this.firestore.collection(Collections.QUOTES).doc(quote.id);

    const { orderId, stockChanges } = await this.firestore.runTransaction(async (tx) => {
      // Phase 1 — ALL reads before ANY writes (Firestore transaction rule).
      // The quote is re-read here, not trusted from the check above: two
      // concurrent checkouts of one approved quote would otherwise both
      // pass it and turn the negotiated discount into two orders.
      const quoteSnap = await tx.get(quoteRef);
      const current = quoteSnap.data() as Quote | undefined;
      if (current?.status !== QuoteStatus.APPROVED || current.convertedOrderId) {
        throw new ConflictException('This quote was already converted to an order');
      }
      // One getAll() round trip for every line instead of N sequential
      // tx.get() calls.
      const productsById = await this.productsService.getForUpdateMany(
        tx,
        current.items.map((line) => line.productId),
      );
      const reads = current.items.map((line) => productsById.get(line.productId)!);

      // Phase 2 — ALL writes.
      let subtotal = 0;
      const items: OrderItem[] = [];
      const stockChanges: StockChangedEvent[] = [];

      reads.forEach(({ ref, product }, idx) => {
        const line = current.items[idx];
        const nextStock = this.productsService.reserveStock(tx, ref, product, line.qty);
        const unitPrice = round2(
          line.unitPrice * (1 - line.discountPct / 100) * (1 - current.globalDiscountPct / 100),
        );
        const lineTotal = round2(unitPrice * line.qty);
        subtotal += lineTotal;
        items.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          categoryLabel: product.category.label,
          qty: line.qty,
          unitPrice,
          unitCost: product.cost,
          lineTotal,
        });
        stockChanges.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          stock: nextStock,
          minStockThreshold: product.minStockThreshold,
        });
      });

      const taxAmount = round2(subtotal * TAX_RATE);
      const fulfillmentMethod = dto.fulfillmentMethod ?? FulfillmentMethod.DELIVERY;
      const shippingCost = await this.resolveShippingCost(fulfillmentMethod, dto.shipping);
      const totalAmount = round2(subtotal + taxAmount + shippingCost);
      this.assertWithinCreditLine(creditLine, totalAmount);

      const orderRef = this.repo.collection().doc();
      const now = FieldValue.serverTimestamp();
      tx.set(orderRef, {
        userId: user.id,
        status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
        paymentMethod: dto.paymentMethod,
        fulfillmentMethod,
        subtotal,
        taxAmount,
        shippingCost,
        discountAmount: 0,
        totalAmount,
        quoteId: quote.id,
        shippingFullName: dto.shipping.fullName,
        shippingPhone: dto.shipping.phone,
        shippingTaxId: dto.shipping.taxId,
        shippingAddress: dto.shipping.address,
        shippingCity: dto.shipping.city,
        shippingState: dto.shipping.state,
        items,
        createdAt: now,
        updatedAt: now,
      });
      tx.update(quoteRef, { convertedOrderId: orderRef.id, updatedAt: now });

      return { orderId: orderRef.id, stockChanges };
    });

    await this.productsService.stockCommitted(stockChanges);
    const order = await this.repo.getOrThrow(orderId);

    let payment: Payment;
    try {
      payment = await this.paymentsService.initiate(
        order.id,
        dto.paymentMethod,
        order.totalAmount,
        dto.paymentReference,
        dto.paymentProofBase64,
      );
    } catch (error) {
      // Payment initiation failed after stock was committed — restore the
      // reserved stock, un-convert the quote, and drop the order.
      await this.compensate(order, quoteRef);
      throw new BadGatewayException(
        `Could not initiate payment for the order, it was cancelled: ${(error as Error).message}`,
      );
    }

    this.events.emit(ORDER_CREATED_EVENT, { orderId: order.id } satisfies OrderCreatedEvent);

    if (payment.status === PaymentStatus.VERIFIED) {
      return this.markPaid(order.id);
    }
    return this.findById(order.id, user);
  }

  /** After a rejection, lets the buyer switch payment method and/or resubmit a reference/proof. */
  async retryPayment(
    orderId: string,
    user: AuthenticatedUser,
    dto: RetryPaymentDto,
  ): Promise<Order> {
    const order = await this.findById(orderId, user);
    if (order.status !== OrderStatus.PENDING_PAYMENT_VERIFICATION) {
      throw new BadRequestException('This order is not awaiting payment verification');
    }
    const payments = await this.paymentsService.findByOrder(orderId, user);
    if (payments[0]?.status !== PaymentStatus.REJECTED) {
      throw new BadRequestException('Only a rejected payment can be retried');
    }
    this.assertWithinCreditLine(
      await this.creditLineFor(order.userId, dto.paymentMethod),
      order.totalAmount,
    );

    await this.repo.update(orderId, { paymentMethod: dto.paymentMethod });
    const payment = await this.paymentsService.initiate(
      orderId,
      dto.paymentMethod,
      order.totalAmount,
      dto.paymentReference,
      dto.paymentProofBase64,
    );

    if (payment.status === PaymentStatus.VERIFIED) {
      return this.markPaid(orderId);
    }
    return this.findById(orderId, user);
  }

  /** Runs as a single transaction, same reasoning as cancel() below: N
   * sequential adjustStock calls (the old implementation) meant N separate
   * transactions, and a failure partway through left the remaining items'
   * stock unrestored while the order got deleted anyway right after the
   * loop — permanently short-stocked products with no order left to trace
   * it back to, and no error surfaced to anyone. One transaction makes the
   * whole compensation all-or-nothing. */
  private async compensate(order: Order, quoteRef?: DocumentReference): Promise<void> {
    const orderRef = this.repo.doc(order.id);
    const stockChanges = await this.firestore.runTransaction(async (tx) => {
      // Phase 1 — ALL reads before ANY writes (Firestore transaction rule).
      // One getAll() round trip for every item instead of N sequential
      // tx.get() calls.
      const stockContextsById = await this.productsService.getStockForUpdateMany(
        tx,
        order.items.map((item) => item.productId),
      );
      const stockContexts = order.items.map((item) => stockContextsById.get(item.productId)!);
      const releaseDiscount = order.discountCode
        ? await this.discountCodesService.beginRelease(tx, order.discountCode)
        : undefined;

      // Phase 2 — ALL writes.
      const changes = stockContexts.map((ctx, idx) =>
        this.productsService.applyStockDelta(tx, ctx, order.items[idx].qty),
      );
      releaseDiscount?.();
      if (quoteRef) {
        tx.update(quoteRef, { convertedOrderId: FieldValue.delete() });
      }
      tx.delete(orderRef);
      return changes;
    });
    await this.productsService.stockCommitted(stockChanges);
  }

  findMine(user: AuthenticatedUser): Promise<Order[]> {
    return this.repo.findAll({
      where: [{ field: 'userId', op: '==', value: user.id }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
  }

  /** Admin listing. With a period: that period's orders only (the month
   * view). With statuses and no period: those statuses across all time — the
   * "pending" view, a small set since orders leave it once handled; sorted
   * here so the `in` query needs no composite index. Neither: the latest
   * 500 (a customer's history in the users panel). */
  async findAll(query: QueryOrdersDto = {}): Promise<Order[]> {
    const byUser: WhereClause[] = query.userId
      ? [{ field: 'userId', op: '==', value: query.userId }]
      : [];
    const period = periodWhere('createdAt', query, 'timestamp');
    const statuses = query.status ?? [];

    if (period.length > 0) {
      const orders = await this.repo.findAll({
        where: [...byUser, ...period],
        orderBy: { field: 'createdAt', direction: 'desc' },
      });
      return statuses.length > 0 ? orders.filter((o) => statuses.includes(o.status)) : orders;
    }
    if (statuses.length > 0) {
      const orders = await this.repo.findAll({
        where: [...byUser, { field: 'status', op: 'in', value: statuses }],
        limit: 500,
      });
      return orders.sort(newestFirst);
    }
    return this.repo.findAll({
      where: byUser,
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
  }

  async findById(id: string, user?: AuthenticatedUser): Promise<Order> {
    const order = await this.repo.getOrThrow(id, 'Order not found');
    if (user && order.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('This order does not belong to you');
    }
    return order;
  }

  async markPaid(orderId: string): Promise<Order> {
    const order = await this.repo.update(orderId, { status: OrderStatus.PAID });
    this.events.emit(ORDER_PAID_EVENT, { orderId: order.id } satisfies OrderPaidEvent);
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: order.id,
      status: order.status,
    } satisfies OrderStatusChangedEvent);
    return order;
  }

  async markErpExported(orderId: string, error?: string): Promise<void> {
    if (error) {
      await this.repo.update(orderId, { erpExportError: error });
    } else {
      await this.repo.update(orderId, {
        erpExportedAt: new Date(),
        erpExportError: FieldValue.delete() as never,
      });
    }
  }

  /** Steps a paid order forward one stage in the fulfillment pipeline
   * (paid -> preparing -> shipped -> fulfilled). */
  async advanceStatus(orderId: string): Promise<Order> {
    const order = await this.findById(orderId);
    const pipeline = fulfillmentPipeline(order.fulfillmentMethod ?? FulfillmentMethod.DELIVERY);
    const idx = pipeline.indexOf(order.status);
    if (idx === -1) {
      throw new BadRequestException('This order is not in an advanceable state');
    }
    if (idx === pipeline.length - 1) {
      throw new BadRequestException('This order has already reached its final stage');
    }
    const updated = await this.repo.update(orderId, { status: pipeline[idx + 1] });
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: updated.id,
      status: updated.status,
    } satisfies OrderStatusChangedEvent);
    return updated;
  }

  /** Cancels an order that hasn't been delivered yet and releases its reserved stock.
   * Runs as a single transaction so two concurrent cancel requests for the same order
   * can't both pass the status check and double-credit stock back. */
  async cancel(orderId: string): Promise<Order> {
    const orderRef = this.repo.doc(orderId);
    const stockChanges = await this.firestore.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new NotFoundException('Order not found');
      const order = { ...orderSnap.data(), id: orderSnap.id } as Order;
      if (order.status === OrderStatus.FULFILLED || order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('This order cannot be cancelled');
      }

      // Phase 1 — ALL reads before ANY writes (Firestore transaction rule).
      // One getAll() round trip for every item instead of N sequential
      // tx.get() calls.
      const stockContextsById = await this.productsService.getStockForUpdateMany(
        tx,
        order.items.map((item) => item.productId),
      );
      const stockContexts = order.items.map((item) => stockContextsById.get(item.productId)!);
      // A cancelled order didn't really use its discount code — a
      // limited-use code gets that use back.
      const releaseDiscount = order.discountCode
        ? await this.discountCodesService.beginRelease(tx, order.discountCode)
        : undefined;

      // Phase 2 — ALL writes.
      const changes = stockContexts.map((ctx, idx) =>
        this.productsService.applyStockDelta(tx, ctx, order.items[idx].qty),
      );
      releaseDiscount?.();
      tx.update(orderRef, {
        status: OrderStatus.CANCELLED,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return changes;
    });

    await this.productsService.stockCommitted(stockChanges);
    const order = await this.repo.getOrThrow(orderId);
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: order.id,
      status: order.status,
    } satisfies OrderStatusChangedEvent);
    return order;
  }
}
