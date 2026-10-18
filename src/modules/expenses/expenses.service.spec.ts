import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ExpensesService } from './expenses.service';
import { ExpenseDueStatus, ExpenseFrequency, ExpenseStatus } from './entities/expense.entity';

describe('ExpensesService.recomputeDueStatuses', () => {
  it('moves what changed with one write each and no read-back', async () => {
    const firestore = new FakeFirestore();
    const pending = { status: ExpenseStatus.PENDING, active: true };
    firestore.seed(Collections.EXPENSES, 'late', {
      ...pending,
      name: 'Alquiler',
      dueDate: '2020-01-01',
      dueStatus: ExpenseDueStatus.CURRENT,
    });
    firestore.seed(Collections.EXPENSES, 'fine', {
      ...pending,
      name: 'Internet',
      dueDate: '2099-01-01',
      dueStatus: ExpenseDueStatus.CURRENT,
    });
    const events = new EventEmitter2();
    const emit = jest.spyOn(events, 'emit');

    await new ExpensesService(firestore as unknown as Firestore, events).recomputeDueStatuses();

    expect(firestore.read(Collections.EXPENSES, 'late')).toMatchObject({
      dueStatus: ExpenseDueStatus.OVERDUE,
    });
    expect(firestore.read(Collections.EXPENSES, 'fine')).toMatchObject({
      dueStatus: ExpenseDueStatus.CURRENT,
    });
    // Just the query's two documents: the write isn't read back.
    expect(firestore.reads).toHaveLength(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe('ExpensesService.markPaid', () => {
  afterEach(() => jest.useRealTimers());

  function build(dueDate: string) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.EXPENSES, 'rent', {
      name: 'Alquiler',
      frequency: ExpenseFrequency.MONTHLY,
      status: ExpenseStatus.PENDING,
      active: true,
      dueDate,
      dueStatus: ExpenseDueStatus.CURRENT,
    });
    const service = new ExpensesService(firestore as unknown as Firestore, new EventEmitter2());
    return { service, read: () => firestore.read(Collections.EXPENSES, 'rent')! };
  }

  it('rolls a monthly expense due on the 31st to the end of a shorter month', async () => {
    const { service, read } = build('2026-01-31');
    await service.markPaid('rent');
    expect(read().dueDate).toBe('2026-02-28');
  });

  it("records the store's day as paid, even late in a Venezuelan evening", async () => {
    jest.useFakeTimers({ now: new Date('2026-10-16T02:30:00Z'), doNotFake: ['nextTick'] });
    const { service, read } = build('2026-10-15');
    await service.markPaid('rent');
    // 10:30 p.m. on the 15th in Caracas, already the 16th in UTC.
    expect(read().lastPaidAt).toBe('2026-10-15');
  });
});
