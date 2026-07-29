import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { isStoragePath, UploadsService } from '../uploads/uploads.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import {
  PayableDueStatus,
  SupplierPayable,
  SupplierPayableStatus,
} from './entities/supplier-payable.entity';
import { SupplierPayment } from './entities/supplier-payment.entity';
import { Supplier } from './entities/supplier.entity';

export const DUE_SOON_THRESHOLD_DAYS = 5;
export const INVOICE_DUE_ALERT_EVENT = 'finance.invoice.due';

export interface InvoiceDueAlertEvent {
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  dueStatus: PayableDueStatus.DUE_SOON | PayableDueStatus.OVERDUE;
  dueDate: string;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  private readonly suppliersRepo: FirestoreRepository<Supplier>;
  private readonly payablesRepo: FirestoreRepository<SupplierPayable>;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly events: EventEmitter2,
    private readonly uploadsService: UploadsService,
  ) {
    this.suppliersRepo = new FirestoreRepository<Supplier>(firestore, Collections.SUPPLIERS);
    this.payablesRepo = new FirestoreRepository<SupplierPayable>(
      firestore,
      Collections.SUPPLIERS_PAYABLES,
    );
  }

  createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepo.create(dto);
  }

  listSuppliers(): Promise<Supplier[]> {
    return this.suppliersRepo.findAll({ orderBy: { field: 'name' } });
  }

  updateSupplier(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    return this.suppliersRepo.update(id, dto);
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<SupplierPayable> {
    return this.payablesRepo.create({
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      status: SupplierPayableStatus.PENDING,
      dueStatus: dueStatusForDueDate(dto.dueDate),
      amountPaid: 0,
      paymentTerms: dto.paymentTerms,
      notes: dto.notes,
    });
  }

  /** General edit for the invoice's own fields — separate from payment-terms
   * and from payment registration, which have their own narrower endpoints. */
  async updateInvoice(id: string, dto: UpdateInvoiceDto): Promise<SupplierPayable> {
    const invoice = await this.findInvoice(id);
    if (invoice.status === SupplierPayableStatus.PAID) {
      throw new BadRequestException('A fully paid invoice cannot be edited');
    }
    if (dto.amount !== undefined && dto.amount < invoice.amountPaid) {
      throw new BadRequestException(
        `Amount cannot be less than what has already been paid (${invoice.amountPaid})`,
      );
    }

    const dueDate = dto.dueDate ?? invoice.dueDate;
    return this.payablesRepo.update(id, {
      supplierId: dto.supplierId ?? invoice.supplierId,
      supplierName: dto.supplierName ?? invoice.supplierName,
      invoiceNumber: dto.invoiceNumber ?? invoice.invoiceNumber,
      amount: dto.amount ?? invoice.amount,
      issueDate: dto.issueDate ?? invoice.issueDate,
      dueDate,
      dueStatus: dueStatusForDueDate(dueDate),
    });
  }

  async updatePaymentTerms(id: string, dto: UpdatePaymentTermsDto): Promise<SupplierPayable> {
    const invoice = await this.findInvoice(id);
    if (invoice.status === SupplierPayableStatus.PAID) {
      throw new BadRequestException('Payment terms can only be changed on an open invoice');
    }
    return this.payablesRepo.update(id, { paymentTerms: dto.paymentTerms, notes: dto.notes });
  }

  async listInvoices(status?: SupplierPayableStatus): Promise<SupplierPayable[]> {
    return this.payablesRepo.findAll({
      where: status ? [{ field: 'status', op: '==', value: status }] : [],
      orderBy: { field: 'dueDate', direction: 'asc' },
      limit: 500,
    });
  }

  findInvoice(id: string): Promise<SupplierPayable> {
    return this.payablesRepo.getOrThrow(id, 'Supplier invoice not found');
  }

  private paymentsRepo(invoiceId: string): FirestoreRepository<SupplierPayment> {
    const invoiceRef = this.payablesRepo.doc(invoiceId); // throws if invoiceId isn't a valid single-segment id
    return new FirestoreRepository<SupplierPayment>(
      this.firestore,
      `${invoiceRef.path}/${Collections.SUPPLIER_PAYMENTS}`,
    );
  }

  async registerPayment(
    invoiceId: string,
    dto: RegisterPaymentDto,
    adminUserId: string,
  ): Promise<SupplierPayable> {
    // Uploaded ahead of the transaction — Storage I/O doesn't belong inside
    // a Firestore transaction closure (which Firestore may retry on
    // contention, re-running any side effect inside it more than once).
    const proofPath = dto.proofBase64
      ? await this.uploadsService.uploadPaymentProof(dto.proofBase64)
      : undefined;

    await this.firestore.runTransaction(async (tx) => {
      const invoice = await this.getPayableForUpdate(tx, invoiceId);
      this.applyPayablePayment(tx, invoiceId, invoice, dto, adminUserId, proofPath);
    });
    return this.findInvoice(invoiceId);
  }

  // --- Transaction-safe split (read phase / write phase) so callers like
  // PurchaseOrdersService can settle the payable atomically alongside their
  // own writes (stock increments, PO status) in a single transaction.

  async getPayableForUpdate(tx: Transaction, invoiceId: string): Promise<SupplierPayable> {
    const snap = await tx.get(this.payablesRepo.doc(invoiceId));
    if (!snap.exists) throw new NotFoundException('Supplier invoice not found');
    const data = snap.data()!;
    if (data.status === SupplierPayableStatus.PAID) {
      throw new BadRequestException('This invoice is already fully paid');
    }
    return {
      ...data,
      id: snap.id,
      createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
    } as SupplierPayable;
  }

  applyPayablePayment(
    tx: Transaction,
    invoiceId: string,
    invoice: SupplierPayable,
    dto: RegisterPaymentDto,
    adminUserId: string,
    proofPath?: string,
  ): void {
    const paymentRef = this.paymentsRepo(invoiceId).collection().doc();
    const now = FieldValue.serverTimestamp();
    tx.set(paymentRef, {
      amount: dto.amount,
      paidAt: new Date(),
      method: dto.method,
      reference: dto.reference,
      proofUrl: proofPath,
      registeredByUserId: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    const newAmountPaid = invoice.amountPaid + dto.amount;
    const fullyPaid = newAmountPaid >= invoice.amount;
    tx.update(this.payablesRepo.doc(invoiceId), {
      amountPaid: newAmountPaid,
      status: fullyPaid ? SupplierPayableStatus.PAID : SupplierPayableStatus.PENDING,
      dueStatus: fullyPaid ? PayableDueStatus.CURRENT : dueStatusForDueDate(invoice.dueDate),
      updatedAt: now,
    });
  }

  // Sorted in Node rather than via Firestore orderBy: a stray field-index
  // override on suppliersPayables/*/payments.paidAt (unrelated to this
  // module, scoped to COLLECTION_GROUP ASCENDING only) blocks the
  // DESCENDING/COLLECTION query Firestore would otherwise need here.
  async listPayments(invoiceId: string): Promise<SupplierPayment[]> {
    const payments = await this.paymentsRepo(invoiceId).findAll();
    const withSignedProofs = await Promise.all(
      payments.map(async (p) =>
        p.proofUrl && isStoragePath(p.proofUrl)
          ? { ...p, proofUrl: await this.uploadsService.getSignedProofUrl(p.proofUrl) }
          : p,
      ),
    );
    return withSignedProofs.sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
    );
  }

  // @nestjs/schedule hands this method straight to the `cron` package as a
  // bare onTick callback — nothing there awaits or catches its promise, so
  // an uncaught rejection here becomes an unhandled promise rejection and
  // crashes the whole process at 6am with no one watching. erp-sync's own
  // manually-created CronJob already guards against exactly this
  // (sync.service.ts's onModuleInit `.catch(...)`); this one and
  // reports.service.ts's rollupYesterday were the two @Cron-decorated
  // methods that didn't.
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recomputeDueStatuses(): Promise<void> {
    try {
      const openInvoices = await this.payablesRepo.findAll({
        where: [{ field: 'status', op: '==', value: SupplierPayableStatus.PENDING }],
      });

      let updated = 0;
      for (const invoice of openInvoices) {
        // Per-item try/catch: one bad invoice (e.g. an unparseable dueDate)
        // must not abort the recompute for every other invoice in the batch.
        try {
          const nextDueStatus = dueStatusForDueDate(invoice.dueDate);
          if (nextDueStatus === invoice.dueStatus) continue;

          await this.payablesRepo.update(invoice.id, { dueStatus: nextDueStatus });
          updated++;

          if (
            nextDueStatus === PayableDueStatus.DUE_SOON ||
            nextDueStatus === PayableDueStatus.OVERDUE
          ) {
            this.events.emit(INVOICE_DUE_ALERT_EVENT, {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              supplierName: invoice.supplierName,
              dueStatus: nextDueStatus,
              dueDate: invoice.dueDate,
            } satisfies InvoiceDueAlertEvent);
          }
        } catch (error) {
          this.logger.error(
            `Failed to recompute due status for invoice ${invoice.id}`,
            error as Error,
          );
        }
      }
      this.logger.log(`Recomputed due status for ${updated}/${openInvoices.length} open supplier invoice(s)`);
    } catch (error) {
      this.logger.error('recomputeDueStatuses cron run failed', error as Error);
    }
  }
}

function dueStatusForDueDate(dueDate: string): PayableDueStatus {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return PayableDueStatus.OVERDUE;
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) return PayableDueStatus.DUE_SOON;
  return PayableDueStatus.CURRENT;
}
