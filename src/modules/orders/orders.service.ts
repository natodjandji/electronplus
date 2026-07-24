import {
  BadGatewayException,
  BadRequestException,
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
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../products/pricing.service';
import { ProductsService, StockChangedEvent } from '../products/products.service';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { QuotesService } from '../quotes/quotes.service';
import { ShippingRatesService } from '../shipping-rates/shipping-rates.service';
import { CreateOrderFromQuoteDto } from './dto/create-order-from-quote.dto';
import { CreateOrderDto, ShippingInfoDto } from './dto/create-order.dto';
import { RetryPaymentDto } from './dto/retry-payment.dto';
import { fulfillmentPipeline, FulfillmentMethod, Order, OrderItem, OrderStatus } from './entities/order.entity';

export const ORDER_PAID_EVENT = 'order.paid';
/** Venezuela's standard IVA rate — applied to (subtotal - discount). */
const TAX_RATE = 0.16;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OrderPaidEvent {
  orderId: string;
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

  async create(user: AuthenticatedUser, dto: CreateOrderDto): Promise<Order> {
    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('Duplicate product in order items — merge quantities into a single line instead');
    }

    const { orderId, stockChanges } = await this.firestore.runTransaction(async (tx) => {
      // Phase 1 — ALL reads (Firestore requires every read in a transaction
      // to happen before any write).
      const reads = await Promise.all(
        dto.items.map((line) => this.productsService.getForUpdate(tx, line.productId)),
      );

      // Phase 2 — ALL writes.
      let subtotal = 0;
      const items: OrderItem[] = [];
      const stockChanges: StockChangedEvent[] = [];

      reads.forEach(({ ref, product }, idx) => {
        const line = dto.items[idx];
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
      if (dto.discountCode) {
        const result = await this.discountCodesService.validate(dto.discountCode, subtotal);
        if (!result.valid) throw new BadRequestException(result.message ?? 'Código de descuento inválido');
        discountCode = result.code;
        discountAmount = result.discountAmount;
      }

      const taxableBase = subtotal - discountAmount;
      const taxAmount = round2(taxableBase * TAX_RATE);
      const fulfillmentMethod = dto.fulfillmentMethod ?? FulfillmentMethod.DELIVERY;
      const shippingCost = await this.resolveShippingCost(fulfillmentMethod, dto.shipping);
      const totalAmount = round2(taxableBase + taxAmount + shippingCost);

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

    for (const change of stockChanges) this.productsService.emitStockChanged(change);
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
      const reads = await Promise.all(
        quote.items.map((line) => this.productsService.getForUpdate(tx, line.productId)),
      );

      // Phase 2 — ALL writes.
      let subtotal = 0;
      const items: OrderItem[] = [];
      const stockChanges: StockChangedEvent[] = [];

      reads.forEach(({ ref, product }, idx) => {
        const line = quote.items[idx];
        const nextStock = this.productsService.reserveStock(tx, ref, product, line.qty);
        const unitPrice = round2(
          line.unitPrice * (1 - line.discountPct / 100) * (1 - quote.globalDiscountPct / 100),
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

    for (const change of stockChanges) this.productsService.emitStockChanged(change);
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

    if (payment.status === PaymentStatus.VERIFIED) {
      return this.markPaid(order.id);
    }
    return this.findById(order.id, user);
  }

  /** After a rejection, lets the buyer switch payment method and/or resubmit a reference/proof. */
  async retryPayment(orderId: string, user: AuthenticatedUser, dto: RetryPaymentDto): Promise<Order> {
    const order = await this.findById(orderId, user);
    if (order.status !== OrderStatus.PENDING_PAYMENT_VERIFICATION) {
      throw new BadRequestException('This order is not awaiting payment verification');
    }
    const payments = await this.paymentsService.findByOrder(orderId, user);
    if (payments[0]?.status !== PaymentStatus.REJECTED) {
      throw new BadRequestException('Only a rejected payment can be retried');
    }

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

  private async compensate(order: Order, quoteRef?: DocumentReference): Promise<void> {
    for (const item of order.items) {
      await this.productsService.adjustStock(item.productId, { delta: item.qty });
    }
    if (quoteRef) {
      await quoteRef.update({ convertedOrderId: FieldValue.delete() });
    }
    await this.repo.delete(order.id);
  }

  findMine(user: AuthenticatedUser): Promise<Order[]> {
    return this.repo.findAll({
      where: [{ field: 'userId', op: '==', value: user.id }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 500,
    });
  }

  findAll(userId?: string): Promise<Order[]> {
    return this.repo.findAll({
      where: userId ? [{ field: 'userId', op: '==', value: userId }] : [],
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
    return order;
  }

  async markErpExported(orderId: string, error?: string): Promise<void> {
    if (error) {
      await this.repo.update(orderId, { erpExportError: error });
    } else {
      await this.repo.update(orderId, { erpExportedAt: new Date(), erpExportError: FieldValue.delete() as never });
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
    return this.repo.update(orderId, { status: pipeline[idx + 1] });
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
      const stockContexts = await Promise.all(
        order.items.map((item) => this.productsService.getStockForUpdate(tx, item.productId)),
      );

      // Phase 2 — ALL writes.
      const changes = stockContexts.map((ctx, idx) =>
        this.productsService.applyStockDelta(tx, ctx, order.items[idx].qty),
      );
      tx.update(orderRef, { status: OrderStatus.CANCELLED, updatedAt: FieldValue.serverTimestamp() });
      return changes;
    });

    for (const change of stockChanges) this.productsService.emitStockChanged(change);
    return this.repo.getOrThrow(orderId);
  }
}
