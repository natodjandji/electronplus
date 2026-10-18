/**
 * The store's calendar. The server runs in UTC, where a Venezuelan evening
 * (8 p.m. on) is already the next day, so "today", day boundaries and due
 * dates are worked out here, in the store's time zone.
 */
export const STORE_TIME_ZONE = 'America/Caracas';
/** Venezuela has kept UTC−4 all year, with no daylight saving, since 2016. */
const STORE_UTC_OFFSET = '-04:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The store's calendar day for a moment, as YYYY-MM-DD. */
export function storeDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE }).format(date);
}

/** The moment a store calendar day (YYYY-MM-DD) starts. */
export function storeDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${STORE_UTC_OFFSET}`);
}

/** The calendar day `days` after `day` (before it, when negative). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from one calendar day to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The same day `months` later, on the month's last day when it's shorter
 * (Jan 31 + 1 month = Feb 28/29, not Mar 3). */
export function addMonths(day: string, months: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(dayOfMonth, lastDay));
  return target.toISOString().slice(0, 10);
}
