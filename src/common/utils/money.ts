/** Venezuela's standard IVA rate — applied to (subtotal - discount). */
export const TAX_RATE = 0.16;

/** To the cent, halves up. Plain Math.round(n * 100) / 100 gets thousands
 * of everyday amounts wrong (0.145 → 0.14, 2.135 → 2.13), because they're
 * stored a hair below the half; adding Number.EPSILON doesn't help past
 * 1.0. Scaling by (1 + EPSILON) lifts them back at any size, without
 * rounding up anything really below the half. Same as the frontend's
 * lib/money.ts, so the totals a customer sees are the ones charged. */
export function round2(n: number): number {
  return Math.round(n * 100 * (1 + Number.EPSILON)) / 100;
}
