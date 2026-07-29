/** Every template below interpolates data that ultimately traces back to
 * user input or the ERP sync (display names, product names, addresses) into
 * raw HTML — escape it the same way the frontend's JSON-LD injection was
 * fixed, so a crafted name/address can't break the markup or inject a link. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
