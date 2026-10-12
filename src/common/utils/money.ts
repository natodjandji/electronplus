/** Venezuela's standard IVA rate — applied to (subtotal - discount). */
export const TAX_RATE = 0.16;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
