/** Mirrors frontend/src/lib/electron-store.tsx's formatMoney — kept as a
 * separate copy since the backend and frontend are independent TS projects,
 * same as OrderStatus and other enums already duplicated across the two. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}
