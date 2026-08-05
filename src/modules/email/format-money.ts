/** Mirrors frontend/src/lib/electron-store.tsx's formatMoney — kept as a
 * separate copy since the backend and frontend are independent TS projects,
 * same as OrderStatus and other enums already duplicated across the two. */
export function formatMoney(amount: number): string {
  // Intl.NumberFormat only accepts real ISO 4217 codes, so USD is still what
  // drives the number formatting — "REF" (referencial) replaces just the
  // rendered currency label, since Venezuelan price regulations don't allow
  // advertising retail prices as literal USD.
  const parts = new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).formatToParts(amount);
  return parts.map((part) => (part.type === 'currency' ? 'REF' : part.value)).join('');
}
