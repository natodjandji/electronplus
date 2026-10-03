import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { OrdersService } from '../../modules/orders/orders.service';
import { OrderStatus } from '../../modules/orders/entities/order.entity';
import { QueryOrdersDto } from '../../modules/orders/dto/query-orders.dto';
import { QueryInvoicesDto } from '../../modules/finance/dto/query-invoices.dto';
import { periodWhere } from './period-query.dto';

describe('periodWhere', () => {
  it('is empty when no period was asked for', () => {
    expect(periodWhere('createdAt', {}, 'timestamp')).toEqual([]);
  });

  it('bounds timestamps as Dates and calendar dates as strings, end exclusive', () => {
    const from = '2026-10-01T04:00:00.000Z';
    const to = '2026-11-01T04:00:00.000Z';
    expect(periodWhere('createdAt', { from, to }, 'timestamp')).toEqual([
      { field: 'createdAt', op: '>=', value: new Date(from) },
      { field: 'createdAt', op: '<', value: new Date(to) },
    ]);
    expect(periodWhere('dueDate', { from: '2026-10-01', to: '2026-11-01' }, 'date')).toEqual([
      { field: 'dueDate', op: '>=', value: '2026-10-01' },
      { field: 'dueDate', op: '<', value: '2026-11-01' },
    ]);
  });

  it('rejects half a period, a reversed one, and one spanning years', () => {
    const check = (from?: string, to?: string) => () => periodWhere('x', { from, to }, 'date');
    expect(check('2026-10-01')).toThrow(BadRequestException);
    expect(check('2026-11-01', '2026-10-01')).toThrow(BadRequestException);
    expect(check('2020-01-01', '2026-01-01')).toThrow(BadRequestException);
  });
});

describe('OrdersService.findAll — month view and pending view', () => {
  function setup() {
    const firestore = new FakeFirestore();
    const at = (iso: string) => new Date(iso);
    const seed = (id: string, createdAt: string, status: OrderStatus) =>
      firestore.seed(Collections.ORDERS, id, { createdAt: at(createdAt), status, items: [] });
    seed('sep-pending', '2026-09-20T12:00:00Z', OrderStatus.PENDING_PAYMENT_VERIFICATION);
    seed('sep-done', '2026-09-21T12:00:00Z', OrderStatus.FULFILLED);
    seed('oct-paid', '2026-10-02T12:00:00Z', OrderStatus.PAID);
    seed('oct-pending', '2026-10-03T12:00:00Z', OrderStatus.PENDING_PAYMENT_VERIFICATION);
    const service = new OrdersService(
      firestore as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
    );
    return { firestore, service };
  }

  it('reads only the requested month, newest first', async () => {
    const { firestore, service } = setup();
    const october = await service.findAll({
      from: '2026-10-01T04:00:00.000Z',
      to: '2026-11-01T04:00:00.000Z',
    });
    expect(october.map((o) => o.id)).toEqual(['oct-pending', 'oct-paid']);
    expect(firestore.reads.filter((p) => p.startsWith('orders/'))).toHaveLength(2);
  });

  it('lists a status across every month, so older pending work stays visible', async () => {
    const { service } = setup();
    const pending = await service.findAll({ status: [OrderStatus.PENDING_PAYMENT_VERIFICATION] });
    expect(pending.map((o) => o.id)).toEqual(['oct-pending', 'sep-pending']);
  });
});

describe('list query DTOs through the app ValidationPipe', () => {
  // Same options as main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const parse = (value: object, metatype: new () => object) =>
    pipe.transform(value, { type: 'query', metatype });

  it('splits ?status=a,b and keeps the period strings', async () => {
    await expect(
      parse(
        {
          status: 'pending_payment_verification,paid',
          from: '2026-10-01T04:00:00.000Z',
          to: '2026-11-01T04:00:00.000Z',
        },
        QueryOrdersDto,
      ),
    ).resolves.toMatchObject({
      status: ['pending_payment_verification', 'paid'],
      from: '2026-10-01T04:00:00.000Z',
    });
  });

  it('rejects unknown statuses and malformed dates', async () => {
    await expect(parse({ status: 'paid,bogus' }, QueryOrdersDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      parse({ from: '01/10/2026', to: '2026-11-01' }, QueryInvoicesDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      parse({ from: '2026-10-01', to: '2026-11-01' }, QueryInvoicesDto),
    ).resolves.toBeTruthy();
  });
});
