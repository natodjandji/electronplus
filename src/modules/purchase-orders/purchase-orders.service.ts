import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, WhereClause } from '../../firebase/firestore.repository';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FinanceService } from '../finance/finance.service';
import { ProductsService } from '../products/products.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { RegisterPurchaseOrderPaymentDto } from './dto/register-purchase-order-payment.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import { UpdatePurchaseOrderItemsDto } from './dto/update-purchase-order-items.dto';
import { PurchaseOrderPayment } from './entities/purchase-order-payment.entity';
import { PurchaseOrder, PurchaseOrderStatus } from './entities/purchase-order.entity';
import { buildItems, computeTotals } from './purchase-order-totals';

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
    return new FirestoreRepository<PurchaseOrderPayment>(
      this.firestore,
      `${Collections.PURCHASE_ORDERS}/${orderId}/${Collections.PURCHASE_ORDER_PAYMENTS}`,
    );
  }

  async create(dto: CreatePurchaseOrderDto, user: AuthenticatedUser): Promise<PurchaseOrder> {
    const products = new Map(
      await Promise.all(
        dto.items.map(async (i) => {
          const product = await this.productsService.findById(i.productId);
          return [i.productId, { sku: product.sku, name: product.name }] as const;
        }),
      ),
    );

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
      warehouseId: dto.warehouseId,
      createdBy: user.id,
    });
  }

  async findAll(query: QueryPurchaseOrdersDto): Promise<PurchaseOrder[]> {
    const where: WhereClause[] = [];
    if (query.status) where.push({ field: 'status', op: '==', value: query.status });
    if (query.from) where.push({ field: 'createdAt', op: '>=', value: new Date(query.from) });
    if (query.to) where.push({ field: 'createdAt', op: '<=', value: new Date(query.to) });

    const orders = await this.repo.findAll({ where, orderBy: { field: 'createdAt', direction: 'desc' } });
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

    const products = new Map(
      await Promise.all(
        dto.items.map(async (i) => {
          const product = await this.productsService.findById(i.productId);
          return [i.productId, { sku: product.sku, name: product.name }] as const;
        }),
      ),
    );
    const items = buildItems(dto.items, products);
    const totals = computeTotals(items, dto.globalDiscount ?? order.globalDiscount);

    return this.repo.update(id, { items, globalDiscount: dto.globalDiscount ?? order.globalDiscount, totals });
  }

  async updatePaymentTerms(id: string, dto: UpdatePaymentTermsDto): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (order.status === PurchaseOrderStatus.PAID || order.status === PurchaseOrderStatus.CANCELLED) {
      throw new ForbiddenException('Payment terms can only be changed before the order is settled or cancelled');
    }
    return this.repo.update(id, { paymentTerms: dto.paymentTerms, notes: dto.notes });
  }

  /** draft -> issued: locks item editing and opens a matching entry in accounts payable. */
  async issue(id: string): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new ForbiddenException('Only draft purchase orders can be issued');
    }

    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + DEFAULT_PAYABLE_TERM_DAYS);
    const toIso = (d: Date) => d.toISOString().slice(0, 10);

    const payable = await this.financeService.createInvoice({
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      invoiceNumber: `PO-${order.id.slice(0, 8).toUpperCase()}`,
      amount: order.totals.totalAmount,
      issueDate: toIso(issueDate),
      dueDate: toIso(dueDate),
    });

    return this.repo.update(id, {
      status: PurchaseOrderStatus.ISSUED,
      issuedAt: issueDate,
      linkedPayableId: payable.id,
    });
  }

  /**
   * Registers a payment against the order. Once the accumulated amount
   * covers the total, the order settles: it's marked `paid`, the linked
   * accounts-payable balance is updated, and the ordered quantities are
   * added to inventory.
   */
  async registerPayment(id: string, dto: RegisterPurchaseOrderPaymentDto, user: AuthenticatedUser): Promise<PurchaseOrder> {
    const order = await this.findById(id);
    if (order.status === PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Issue the purchase order before registering payments against it');
    }
    if (order.status === PurchaseOrderStatus.PAID || order.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('This purchase order is already settled or cancelled');
    }

    const paidAt = new Date();
    await this.paymentsRepo(id).create({
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      paidAt,
      registeredByUserId: user.id,
    });

    if (order.linkedPayableId) {
      await this.financeService.registerPayment(order.linkedPayableId, dto, user.id);
    }

    const amountPaid = order.amountPaid + dto.amount;
    const fullyPaid = amountPaid >= order.totals.totalAmount;

    const updated = await this.repo.update(id, {
      amountPaid,
      status: fullyPaid ? PurchaseOrderStatus.PAID : PurchaseOrderStatus.PARTIALLY_PAID,
      paymentDetails: { paidAt, method: dto.method, reference: dto.reference },
    });

    if (fullyPaid) {
      for (const item of order.items) {
        await this.productsService.adjustStock(item.productId, {
          delta: item.quantityOrdered,
          warehouseId: order.warehouseId,
          reason: `Purchase order ${order.id} settled`,
        });
      }
    }

    return updated;
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
