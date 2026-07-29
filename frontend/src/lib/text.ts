/** Strips combining diacritical marks (U+0300–U+036F) left behind by NFD normalization. */
export function stripDiacritics(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
}

export function slugify(label: string): string {
  return stripDiacritics(label.normalize("NFD"))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * JSON.stringify doesn't escape `</`, so a field containing `</script>`
 * (e.g. a product name synced from the ERP) would break out of the
 * `<script type="application/ld+json">` tag it's injected into via
 * dangerouslySetInnerHTML. < is valid inside a JSON string and
 * parses back to the same value.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
