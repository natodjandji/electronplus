import { BadGatewayException, BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../products/pricing.service';
import { ProductsService, StockChangedEvent } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderItem, OrderStatus } from './entities/order.entity';

export const ORDER_PAID_EVENT = 'order.paid';

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
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Order>(firestore, Collections.ORDERS);
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
      let totalAmount = 0;
      const items: OrderItem[] = [];
      const stockChanges: StockChangedEvent[] = [];

      reads.forEach(({ ref, product }, idx) => {
        const line = dto.items[idx];
        const nextStock = this.productsService.reserveStock(tx, ref, product, line.qty);
        const unitPrice = this.pricingService.priceFor(product);
        const lineTotal = unitPrice * line.qty;
        totalAmount += lineTotal;
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

      const orderRef = this.repo.collection().doc();
      const now = FieldValue.serverTimestamp();
      tx.set(orderRef, {
        userId: user.id,
        status: OrderStatus.PENDING_PAYMENT_VERIFICATION,
        paymentMethod: dto.paymentMethod,
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

  private async compensate(order: Order): Promise<void> {
    for (const item of order.items) {
      await this.productsService.adjustStock(item.productId, { delta: item.qty });
    }
    await this.repo.delete(order.id);
  }

  findMine(user: AuthenticatedUser): Promise<Order[]> {
    return this.repo.findAll({
      where: [{ field: 'userId', op: '==', value: user.id }],
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
  }

  findAll(): Promise<Order[]> {
    return this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
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

  markFulfilled(orderId: string): Promise<Order> {
    return this.repo.update(orderId, { status: OrderStatus.FULFILLED });
  }
}
