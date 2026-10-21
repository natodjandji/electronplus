import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { newestFirst, periodWhere } from '../../common/dto/period-query.dto';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FinanceService } from '../finance/finance.service';
import {
  ProductsService,
  StockChangedEvent,
  StockUpdateContext,
} from '../products/products.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { RegisterPurchaseOrderPaymentDto } from './dto/register-purchase-order-payment.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import { UpdatePurchaseOrderItemsDto } from './dto/update-purchase-order-items.dto';
import { PurchaseOrderPayment } from './entities/purchase-order-payment.entity';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { buildItems, computeTotals } from './purchase-order-totals';
import { addDays, storeDay } from '../../common/utils/store-day';

const DEFAULT_PAYABLE_TERM_DAYS = 30;

@Injectable()
export class PurchaseOrdersService {
  private readonly repo: FirestoreRepository<PurchaseOrder>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly financeService: FinanceService,
  ) {
    this.repo = new FirestoreRepository<PurchaseOrder>(firestore, Collections.PURCHASE_ORDERS);
  }

  private paymentsRepo(orderId: string): FirestoreRepository<PurchaseOrderPayment> {
    const orderRef = this.repo.doc(orderId); // throws if orderId isn't a valid single-segment id
    return new FirestoreRepository<PurchaseOrderPayment>(
      this.firestore,
      `${orderRef.path}/${Collections.PURCHASE_ORDER_PAYMENTS}`,
    );
  }

  /** One getAll() round trip for every product on the order instead of one
   * findById() per line item. findByIds() silently drops ids it can't find,
   * so unlike the old per-item findById() this checks for that itself —
   * otherwise a bad productId would degrade to a garbage line item instead
   * of failing the request. */
  private async loadProductsByIds(
    ids: string[],
  ): Promise<Map<string, { sku: string; name: string }>> {
    const uniqueIds = [...new Set(ids)];
    const products = await this.productsService.findByIds(uniqueIds);
    const map = new Map(products.map((p) => [p.id, { sku: p.sku, name: p.name }]));
    const missing = uniqueIds.filter((id) => !map.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown product id(s): ${missing.join(', ')}`);
    }
    return map;
  }

  /** One line per product. Settling adds each line's units to stock in one
   * transaction, where a second write to the same product replaces the
   * first instead of adding to it. */
  private assertNoRepeatedProducts(items: { productId: string }[]): void {
    const ids = items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un producto aparece en más de una línea: junta sus cantidades en una sola.',
      );
    }
  }

  async create(dto: CreatePurchaseOrderDto, user: AuthenticatedUser): Promise<PurchaseOrder> {
    this.assertNoRepeatedProducts(dto.items);
    const products = await this.loadProductsByIds(dto.items.map((i) => i.productId));

    const items = buildItems(dto.items, products);
    const totals = computeTotals(items, dto.globalDiscount ?? 0);

    return this.repo.create({
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      items,
      globalDiscount: dto.globalDiscount ?? 0,
      totals,
      paymentTerms: dto.paymentTerms,
      notes: dto.notes,
      status: PurchaseOrderStatus.DRAFT,
      amountPaid: 0,
      createdBy: user.id,
    });
  }

  /** Same modes as OrdersService.findAll: a period's orders (the month
   * view), a set of statuses across all time (the "pending" view, sorted
   * here so the `in` query needs no composite index), or everything.
   * Statuses and supplier narrow a period's result in memory — it's one
   * month, already loaded. */
  async findAll(query: QueryPurchaseOrdersDto = {}): Promise<PurchaseOrder[]> {
    const period = periodWhere('createdAt', query, 'timestamp');
    const statuses = query.status ?? [];

    let orders: PurchaseOrder[];
    if (period.length > 0) {
      orders = await this.repo.findAll({
        where: period,
        orderBy: { field: 'createdAt', direction: 'desc' },
      });
      if (statuses.length > 0) orders = orders.filter((o) => statuses.includes(o.status));
    } else if (statuses.length > 0) {
      orders = await this.repo.findAll({ where: [{ field: 'status', op: 'in', value: statuses }] });
      orders.sort(newestFirst);
    } else {
      orders = await this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
    }
    return query.supplierId ? orders.filter((o) => o.supplierId === query.supplierId) : orders;
  }

  findById(id: string): Promise<PurchaseOrder> {
    return this.repo.getOrThrow(id, 'Purchase order not found');
  }

  listPayments(orderId: string): Promise<PurchaseOrderPayment[]> {
    return this.paymentsRepo(orderId).findAll({ orderBy: { field: 'paidAt', direction: 'desc' } });
  }

  async updateItems(id: string, dto: UpdatePurchaseOrderItemsDto): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new ForbiddenException('Only draft purchase orders can have their items edited');
    }

    this.assertNoRepeatedProducts(dto.items);
    const products = await this.loadProductsByIds(dto.items.map((i) => i.productId));
    const items = buildItems(dto.items, products);
    const totals = computeTotals(items, dto.globalDiscount ?? order.globalDiscount);

    return this.repo.update(id, {
      items,
      globalDiscount: dto.globalDiscount ?? order.globalDiscount,
      totals,
      supplierId: dto.supplierId ?? order.supplierId,
      supplierName: dto.supplierName ?? order.supplierName,
    });
  }

  /** Drafts only — once issued, the order has a matching accounts-payable
   * entry and possibly payments against it, so it's cancelled, not deleted. */
  async remove(id: string): Promise<void> {
    const order = await this.findById(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new ForbiddenException('Only draft purchase orders can be deleted');
    }
    await this.repo.delete(id);
  }

  async updatePaymentTerms(id: string, dto: UpdatePaymentTermsDto): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (
      order.status === PurchaseOrderStatus.PAID ||
      order.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new ForbiddenException(
        'Payment terms can only be changed before the order is settled or cancelled',
      );
    }
    return this.repo.update(id, { paymentTerms: dto.paymentTerms, notes: dto.notes });
  }

  /** draft -> issued: locks item editing and opens a matching entry in
   * accounts payable. The status changes first, in a transaction, so a
   * double click can't open two payables for one order. */
  async issue(id: string): Promise<PurchaseOrder> {
    const ref = this.repo.doc(id);
    const issuedAt = new Date();
    const order = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundException('Purchase order not found');
      const current = { ...snap.data(), id: snap.id } as PurchaseOrder;
      if (current.status !== PurchaseOrderStatus.DRAFT) {
        throw new ForbiddenException('Only draft purchase orders can be issued');
      }
      tx.update(ref, {
        status: PurchaseOrderStatus.ISSUED,
        issuedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return current;
    });

    const issueDate = storeDay(issuedAt);
    let payableId: string;
    try {
      ({ id: payableId } = await this.financeService.createInvoice({
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        invoiceNumber: `PO-${order.id.slice(0, 8).toUpperCase()}`,
        amount: order.totals.totalAmount,
        issueDate,
        dueDate: addDays(issueDate, DEFAULT_PAYABLE_TERM_DAYS),
      }));
    } catch (error) {
      // No payable was opened: back to draft, so it can be issued again.
      await this.repo.patch(id, {
        status: PurchaseOrderStatus.DRAFT,
        issuedAt: FieldValue.delete() as never,
      });
      throw error;
    }

    return this.repo.update(id, { linkedPayableId: payableId });
  }

  /**
   * Registers a payment against the order. Once the accumulated amount
   * covers the total, the order settles: it's marked `paid`, the linked
   * accounts-payable balance is updated, and the ordered quantities are
   * added to inventory — all inside one transaction, so a crash mid-way
   * can never leave the order "paid" without the payable/stock following,
   * or vice versa. Products synced from Profit Plus get no stock here: the
   * purchase reaches their stock once it's registered in Profit.
   */
  async registerPayment(
    id: string,
    dto: RegisterPurchaseOrderPaymentDto,
    user: AuthenticatedUser,
  ): Promise<PurchaseOrder> {
    const stockChanges: StockChangedEvent[] = [];

    await this.firestore.runTransaction(async (tx) => {
      // ---- reads ----
      const orderRef = this.repo.doc(id);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new NotFoundException('Purchase order not found');
      const orderData = orderSnap.data()!;
      const order = {
        ...orderData,
        id: orderSnap.id,
        createdAt: orderData.createdAt?.toDate?.() ?? orderData.createdAt,
        updatedAt: orderData.updatedAt?.toDate?.() ?? orderData.updatedAt,
      } as PurchaseOrder;

      if (order.status === PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException(
          'Issue the purchase order before registering payments against it',
        );
      }
      if (
        order.status === PurchaseOrderStatus.PAID ||
        order.status === PurchaseOrderStatus.CANCELLED
      ) {
        throw new BadRequestException('This purchase order is already settled or cancelled');
      }

      const amountPaid = order.amountPaid + dto.amount;
      // Totals are rounded to cents at write time (purchase-order-totals.ts),
      // but a half-cent epsilon is cheap defense against any float drift
      // reaching this comparison — the failure mode (stuck PARTIALLY_PAID,
      // stock-in gated on fullyPaid never happens) is bad enough to guard
      // twice.
      const fullyPaid = amountPaid >= order.totals.totalAmount - 0.005;

      // A payable already settled from Finanzas takes no more payments; the
      // order still settles and its stock still comes in.
      const payable = order.linkedPayableId
        ? await this.financeService.getPayableForUpdate(tx, order.linkedPayableId, {
            allowPaid: true,
          })
        : undefined;

      // Each product once, with the units of all its lines (orders saved
      // before lines were kept unique can repeat one). A product deleted
      // since has no stock to add, and doesn't block settling the order.
      const unitsByProduct = new Map<string, number>();
      for (const item of order.items) {
        unitsByProduct.set(
          item.productId,
          (unitsByProduct.get(item.productId) ?? 0) + item.quantityOrdered,
        );
      }
      const stockContextsById = !fullyPaid
        ? new Map<string, StockUpdateContext>()
        : await this.productsService.getStockForUpdateMany(tx, [...unitsByProduct.keys()], {
            skipMissing: true,
          });

      // ---- writes ----
      const paidAt = new Date();
      const now = FieldValue.serverTimestamp();
      const paymentRef = this.paymentsRepo(id).collection().doc();
      tx.set(paymentRef, {
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        paidAt,
        registeredByUserId: user.id,
        createdAt: now,
        updatedAt: now,
      });

      if (payable && order.linkedPayableId && !this.financeService.isPayableSettled(payable)) {
        this.financeService.applyPayablePayment(tx, order.linkedPayableId, payable, dto, user.id);
      }

      tx.update(orderRef, {
        amountPaid,
        status: fullyPaid ? PurchaseOrderStatus.PAID : PurchaseOrderStatus.PARTIALLY_PAID,
        paymentDetails: { paidAt, method: dto.method, reference: dto.reference },
        updatedAt: now,
      });

      for (const ctx of stockContextsById.values()) {
        if (ctx.fromErp) continue;
        stockChanges.push(
          this.productsService.applyStockDelta(tx, ctx, unitsByProduct.get(ctx.productId)!),
        );
      }
    });

    await this.productsService.stockCommitted(stockChanges);
    return this.findById(id);
  }

  /** Any linked accounts-payable entry is left in place for the admin to reconcile/remove manually. */
  async cancel(id: string): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (order.status === PurchaseOrderStatus.PAID) {
      throw new ForbiddenException('A fully paid purchase order cannot be cancelled');
    }
    return this.repo.update(id, { status: PurchaseOrderStatus.CANCELLED, cancelledAt: new Date() });
  }
}
