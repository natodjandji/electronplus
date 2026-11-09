import { CODE128 } from "jsbarcode/bin/barcodes/CODE128";

/**
 * `code` as Code 128: one "1" (bar) or "0" (space) per module, with the
 * start, check and stop codes. Code 128 holds any code exactly as written —
 * digits, letters, dashes, slashes — so a scanner types back the very text
 * Profit has, whether it's an EAN barcode or the store's own code. Null for
 * a code it can't hold: empty, or with a character outside ASCII.
 */
export function code128Modules(code: string): string | null {
  if (!code) return null;
  const encoder = new CODE128(code, {});
  return encoder.valid() ? encoder.encode().data : null;
}

/** Each bar of `modules` as [first module, width in modules]. */
export function barRuns(modules: string): [number, number][] {
  const runs: [number, number][] = [];
  for (const match of modules.matchAll(/1+/g)) runs.push([match.index, match[0].length]);
  return runs;
}
