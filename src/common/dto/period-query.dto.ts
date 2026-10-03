import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, Matches } from 'class-validator';
import type { WhereClause } from '../../firebase/firestore.repository';

/** A month view spans ~31 days; this only stops a hand-written request from
 * scanning years of history in one go. */
const MAX_PERIOD_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `from`/`to` as ISO instants, end exclusive — for timestamp fields such as
 * createdAt. The admin's browser computes them from its own month, so the
 * boundaries follow the store's local time, not the server's. */
export class TimestampPeriodQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** `from`/`to` as calendar dates (YYYY-MM-DD), end exclusive — for date-only
 * string fields such as dueDate, which compare correctly as plain strings. */
export class DatePeriodQueryDto {
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

/** Firestore range clauses on `field` for the requested period, or [] when
 * none was requested. Reading one month means reading only that month's
 * documents — the lists this backs used to fetch their whole history. */
export function periodWhere(
  field: string,
  period: { from?: string; to?: string },
  kind: 'timestamp' | 'date',
): WhereClause[] {
  if (!period.from && !period.to) return [];
  if (!period.from || !period.to) {
    throw new BadRequestException('from and to must be given together');
  }
  const from = new Date(period.from);
  const to = new Date(period.to);
  if (!(from < to)) throw new BadRequestException('from must be before to');
  if (to.getTime() - from.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
    throw new BadRequestException(`A period can span at most ${MAX_PERIOD_DAYS} days`);
  }
  const [start, end] = kind === 'timestamp' ? [from, to] : [period.from, period.to];
  return [
    { field, op: '>=', value: start },
    { field, op: '<', value: end },
  ];
}

/** `?status=a,b` → ['a', 'b'] (a single value still works). */
export const CommaSeparated = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : value,
  );

/** Newest first by createdAt — for queries that skip orderBy so they don't
 * need a composite index, and sort their (small) result here instead. */
export function newestFirst<T extends { createdAt: Date }>(a: T, b: T): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
