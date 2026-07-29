/** Strips combining diacritical marks left behind by NFD normalization. */
function stripDiacritics(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return code < 0x0300 || code > 0x036f;
    })
    .join('');
}

/** Lowercase-hyphen slug, e.g. "Zelle Empresarial" -> "zelle-empresarial". */
export function slugify(value: string): string {
  return stripDiacritics(value.normalize('NFD'))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
