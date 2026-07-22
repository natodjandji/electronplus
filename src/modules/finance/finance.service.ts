import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { PayableDueStatus, SupplierPayable, SupplierPayableStatus } from './entities/supplier-payable.entity';
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
  ) {
    this.suppliersRepo = new FirestoreRepository<Supplier>(firestore, Collections.SUPPLIERS);
    this.payablesRepo = new FirestoreRepository<SupplierPayable>(firestore, Collections.SUPPLIERS_PAYABLES);
  }

  createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepo.create(dto);
  }

  listSuppliers(): Promise<Supplier[]> {
    return this.suppliersRepo.findAll({ orderBy: { field: 'name' } });
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<SupplierPayable> {
    return this.payablesRepo.create({
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      status: SupplierPayableStatus.PENDING,
      dueStatus: dueStatusForDueDate(dto.dueDate),
      amountPaid: 0,
    });
  }

  async listInvoices(status?: SupplierPayableStatus): Promise<SupplierPayable[]> {
    return this.payablesRepo.findAll({
      where: status ? [{ field: 'status', op: '==', value: status }] : [],
      orderBy: { field: 'dueDate', direction: 'asc' },
    });
  }

  findInvoice(id: string): Promise<SupplierPayable> {
    return this.payablesRepo.getOrThrow(id, 'Supplier invoice not found');
  }

  private paymentsRepo(invoiceId: string): FirestoreRepository<SupplierPayment> {
    return new FirestoreRepository<SupplierPayment>(
      this.firestore,
      `${Collections.SUPPLIERS_PAYABLES}/${invoiceId}/${Collections.SUPPLIER_PAYMENTS}`,
    );
  }

  async registerPayment(invoiceId: string, dto: RegisterPaymentDto, adminUserId: string): Promise<SupplierPayable> {
    const invoice = await this.findInvoice(invoiceId);
    if (invoice.status === SupplierPayableStatus.PAID) {
      throw new BadRequestException('This invoice is already fully paid');
    }

    await this.paymentsRepo(invoiceId).create({
      amount: dto.amount,
      paidAt: new Date(),
      method: dto.method,
      reference: dto.reference,
      registeredByUserId: adminUserId,
    });

    const newAmountPaid = invoice.amountPaid + dto.amount;
    const fullyPaid = newAmountPaid >= invoice.amount;

    return this.payablesRepo.update(invoiceId, {
      amountPaid: newAmountPaid,
      status: fullyPaid ? SupplierPayableStatus.PAID : SupplierPayableStatus.PENDING,
      dueStatus: fullyPaid ? PayableDueStatus.CURRENT : dueStatusForDueDate(invoice.dueDate),
    });
  }

  listPayments(invoiceId: string): Promise<SupplierPayment[]> {
    return this.paymentsRepo(invoiceId).findAll({ orderBy: { field: 'paidAt', direction: 'desc' } });
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recomputeDueStatuses(): Promise<void> {
    const openInvoices = await this.payablesRepo.findAll({
      where: [{ field: 'status', op: '==', value: SupplierPayableStatus.PENDING }],
    });

    for (const invoice of openInvoices) {
      const nextDueStatus = dueStatusForDueDate(invoice.dueDate);
      if (nextDueStatus === invoice.dueStatus) continue;

      await this.payablesRepo.update(invoice.id, { dueStatus: nextDueStatus });

      if (nextDueStatus === PayableDueStatus.DUE_SOON || nextDueStatus === PayableDueStatus.OVERDUE) {
        this.events.emit(INVOICE_DUE_ALERT_EVENT, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          supplierName: invoice.supplierName,
          dueStatus: nextDueStatus,
          dueDate: invoice.dueDate,
        } satisfies InvoiceDueAlertEvent);
      }
    }
    this.logger.log(`Recomputed due status for ${openInvoices.length} open supplier invoice(s)`);
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
