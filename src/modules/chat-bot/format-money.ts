/**
 * Mirrors frontend/src/lib/electron-store.tsx's formatMoney(): Venezuelan
 * price regulations require anything a customer sees to say "REF"
 * (referencial), not "USD" — this bot's replies are customer-facing, same
 * category as the storefront/cart/checkout, so the same rule applies.
 */
export function formatMoney(n: number): string {
  const parts = new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).formatToParts(n);
  return parts.map((part) => (part.type === 'currency' ? 'REF' : part.value)).join('');
}
