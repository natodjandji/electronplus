import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  Expense,
  ExpenseDueStatus,
  ExpenseFrequency,
  ExpenseStatus,
} from './entities/expense.entity';

export const DUE_SOON_THRESHOLD_DAYS = 5;
export const EXPENSE_DUE_ALERT_EVENT = 'expenses.expense.due';

export interface ExpenseDueAlertEvent {
  expenseId: string;
  name: string;
  dueStatus: ExpenseDueStatus.DUE_SOON | ExpenseDueStatus.OVERDUE;
  dueDate: string;
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);
  private readonly repo: FirestoreRepository<Expense>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<Expense>(firestore, Collections.EXPENSES);
  }

  create(dto: CreateExpenseDto): Promise<Expense> {
    return this.repo.create({
      name: dto.name,
      category: dto.category,
      amount: dto.amount,
      frequency: dto.frequency,
      dueDate: dto.dueDate,
      status: ExpenseStatus.PENDING,
      dueStatus: dueStatusForDueDate(dto.dueDate),
      notes: dto.notes,
      active: true,
    });
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const expense = await this.findById(id);
    const dueDate = dto.dueDate ?? expense.dueDate;
    return this.repo.update(id, {
      name: dto.name ?? expense.name,
      category: dto.category ?? expense.category,
      amount: dto.amount ?? expense.amount,
      frequency: dto.frequency ?? expense.frequency,
      dueDate,
      dueStatus: dueStatusForDueDate(dueDate),
      notes: dto.notes ?? expense.notes,
      active: dto.active ?? expense.active,
    });
  }

  async findAll(status?: ExpenseStatus, category?: string): Promise<Expense[]> {
    const where: { field: string; op: '=='; value: string }[] = [];
    if (status) where.push({ field: 'status', op: '==', value: status });
    if (category) where.push({ field: 'category', op: '==', value: category });
    return this.repo.findAll({
      where,
      orderBy: { field: 'dueDate', direction: 'asc' },
      limit: 500,
    });
  }

  findById(id: string): Promise<Expense> {
    return this.repo.getOrThrow(id, 'Expense not found');
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  /** Marks today's occurrence as paid. A `once` expense closes out; a
   * `monthly`/`annual` one rolls its dueDate forward to the next occurrence
   * and stays `pending` — same record tracks the whole recurring history via
   * lastPaidAt instead of spawning a new doc per cycle. */
  async markPaid(id: string): Promise<Expense> {
    const expense = await this.findById(id);
    const today = new Date().toISOString().slice(0, 10);

    if (expense.frequency === ExpenseFrequency.ONCE) {
      return this.repo.update(id, {
        status: ExpenseStatus.PAID,
        dueStatus: ExpenseDueStatus.CURRENT,
        lastPaidAt: today,
      });
    }

    const nextDueDate = advanceDueDate(expense.dueDate, expense.frequency);
    return this.repo.update(id, {
      dueDate: nextDueDate,
      dueStatus: dueStatusForDueDate(nextDueDate),
      lastPaidAt: today,
    });
  }

  // Same reasoning as FinanceService.recomputeDueStatuses: @Cron hands this
  // straight to the `cron` package with nothing awaiting the promise, so
  // errors must be caught here rather than left to crash the process.
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async recomputeDueStatuses(): Promise<void> {
    try {
      const openExpenses = await this.repo.findAll({
        where: [
          { field: 'status', op: '==', value: ExpenseStatus.PENDING },
          { field: 'active', op: '==', value: true },
        ],
      });

      let updated = 0;
      for (const expense of openExpenses) {
        try {
          const nextDueStatus = dueStatusForDueDate(expense.dueDate);
          if (nextDueStatus === expense.dueStatus) continue;

          await this.repo.update(expense.id, { dueStatus: nextDueStatus });
          updated++;

          if (
            nextDueStatus === ExpenseDueStatus.DUE_SOON ||
            nextDueStatus === ExpenseDueStatus.OVERDUE
          ) {
            this.events.emit(EXPENSE_DUE_ALERT_EVENT, {
              expenseId: expense.id,
              name: expense.name,
              dueStatus: nextDueStatus,
              dueDate: expense.dueDate,
            } satisfies ExpenseDueAlertEvent);
          }
        } catch (error) {
          this.logger.error(
            `Failed to recompute due status for expense ${expense.id}`,
            error as Error,
          );
        }
      }
      this.logger.log(
        `Recomputed due status for ${updated}/${openExpenses.length} open expense(s)`,
      );
    } catch (error) {
      this.logger.error('recomputeDueStatuses cron run failed', error as Error);
    }
  }
}

function dueStatusForDueDate(dueDate: string): ExpenseDueStatus {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return ExpenseDueStatus.OVERDUE;
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) return ExpenseDueStatus.DUE_SOON;
  return ExpenseDueStatus.CURRENT;
}

function advanceDueDate(dueDate: string, frequency: ExpenseFrequency): string {
  const [year, month, day] = dueDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  if (frequency === ExpenseFrequency.MONTHLY) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  return next.toISOString().slice(0, 10);
}
