import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Firestore } from 'firebase-admin/firestore';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { ExpensesService } from './expenses.service';
import { ExpenseDueStatus, ExpenseStatus } from './entities/expense.entity';

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
