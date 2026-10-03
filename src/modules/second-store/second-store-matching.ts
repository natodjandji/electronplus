import { SecondStoreProduct } from './entities/second-store-product.entity';

/** One row of profit-plus-bridge-secundaria's GET /api/productos-sincronizacion. */
export interface BridgeProduct {
  codigo: string;
  descripcion: string;
  precio1: number;
  precio2: number;
  stock: number;
}

type Key = (
  code: string,
  name: string,
  stock: number,
  retail?: number,
  wholesale?: number,
) => string | null;

const normalizeName = (name: string) => name.trim().toLowerCase();

/** Most specific first, so a looser match can never take a record that a
 * tighter one needs. */
const PASSES: Key[] = [
  // Unchanged row: nothing to write.
  (code, name, stock, retail, wholesale) =>
    JSON.stringify([code, normalizeName(name), stock, retail, wholesale]),
  (code, name) => JSON.stringify([code, normalizeName(name)]),
  (code) => (code ? JSON.stringify([code]) : null),
  (_code, name) => JSON.stringify([normalizeName(name)]),
];

/**
 * Pairs each bridge row with at most one existing record, and each record
 * with at most one row (result[i] is row i's record, or undefined = new).
 *
 * `codigo` (`art.ref`) isn't unique in this Profit Plus install — about a
 * hundred articles leave it blank and some refs are shared by different
 * articles — and descriptions repeat too. Matching on either one alone let
 * several rows land on the same record, which then flip-flopped between
 * their stock/prices and got rewritten on every run, while the other record
 * went stale. Records are visited in id order so ties resolve the same way
 * every run.
 */
export function matchBridgeProducts(
  rows: BridgeProduct[],
  existing: SecondStoreProduct[],
): (SecondStoreProduct | undefined)[] {
  const records = [...existing].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const matches = new Array<SecondStoreProduct | undefined>(rows.length);
  const claimed = new Set<string>();

  for (const key of PASSES) {
    const candidates = new Map<string, SecondStoreProduct[]>();
    for (const record of records) {
      if (claimed.has(record.id)) continue;
      const k = key(
        record.code ?? '',
        record.name,
        record.stock,
        record.retailPrice,
        record.wholesalePrice,
      );
      if (k !== null) candidates.set(k, [...(candidates.get(k) ?? []), record]);
    }

    rows.forEach((row, i) => {
      if (matches[i]) return;
      const k = key(row.codigo, row.descripcion, row.stock, row.precio1, row.precio2);
      const record = k === null ? undefined : candidates.get(k)?.find((r) => !claimed.has(r.id));
      if (!record) return;
      matches[i] = record;
      claimed.add(record.id);
    });
  }
  return matches;
}
