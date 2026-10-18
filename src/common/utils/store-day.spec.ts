import { addDays, addMonths, daysBetween, storeDay, storeDayStart } from './store-day';

describe('store calendar (Venezuela, UTC−4)', () => {
  it('keeps a Venezuelan evening on its own day, though UTC already moved on', () => {
    expect(storeDay(new Date('2026-10-16T02:00:00Z'))).toBe('2026-10-15'); // 10 p.m. on the 15th
    expect(storeDay(new Date('2026-10-16T04:00:00Z'))).toBe('2026-10-16'); // midnight
  });

  it('starts a store day at 04:00 UTC', () => {
    expect(storeDayStart('2026-10-16').toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('counts and steps whole calendar days, across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(daysBetween('2026-10-15', '2026-10-20')).toBe(5);
    expect(daysBetween('2026-10-20', '2026-10-15')).toBe(-5);
  });

  it("lands on the month's last day when the next month is shorter", () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-10-15', -6)).toBe('2026-04-15');
  });
});
