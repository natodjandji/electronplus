export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** For date-only values ("2026-10-15", e.g. due dates). `new Date()` reads
 * those as UTC midnight, which in Venezuela (UTC−4) is the previous day — so
 * they're built from their parts, in local time, instead. */
export function formatCalendarDate(ymd: string): string {
  const [year, month, day] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-VE");
}

/** Today on this device's calendar, as YYYY-MM-DD — for date inputs.
 * `toISOString()` gives the UTC date, which in Venezuela turns into
 * tomorrow from 8 p.m. on. */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
