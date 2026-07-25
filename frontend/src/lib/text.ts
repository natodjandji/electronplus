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
