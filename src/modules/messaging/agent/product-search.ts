import type { Product } from '../../products/entities/product.entity';

/** Words a customer types that say nothing about which product. */
const STOP_WORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'que',
  'se',
  'su',
  'un',
  'una',
  'unas',
  'unos',
  'y',
  'tipo',
  'tienen',
  'tiene',
  'hay',
]);

/** Lowercase, no accents, units glued to their number ("9 W" → "9w"). */
export function normalizeSearch(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.,]+/g, ' ')
      .replace(/(\d)[.,](\d)/g, '$1_$2')
      .replace(/[.,]/g, ' ')
      // "2x20A" is two numbers: a breaker found by "20a" or "2 x 20".
      .replace(/(\d)\s*x\s*(\d)/g, '$1 $2')
      .replace(/(\d|\b)watts?\b/g, '$1w')
      .replace(/(\d+)\s+(w|v|volts?|a|amp|amps|mm|m|mts|k|kw|hp)\b/g, '$1$2')
      .trim()
  );
}

/** Singular-ish form, so "bombillos" finds "bombillo". */
function stem(word: string): string {
  if (/^\d/.test(word)) return word.replace(/watts?$/, 'w');
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return normalizeSearch(text)
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(stem);
}

interface Indexed {
  product: Product;
  words: string[];
  sku: string;
}

const indexCache = new WeakMap<Product[], Indexed[]>();

function indexOf(catalog: Product[]): Indexed[] {
  let index = indexCache.get(catalog);
  if (!index) {
    index = catalog.map((product) => ({
      product,
      sku: normalizeSearch(product.sku),
      words: tokens(
        [
          product.name,
          product.brand ?? '',
          product.sku,
          product.category?.label ?? '',
          product.specs ?? '',
        ].join(' '),
      ),
    }));
    indexCache.set(catalog, index);
  }
  return index;
}

/**
 * Catalog search for the assistant: every word of the query counts, a whole
 * word more than a prefix, and most of them must match. In-stock products
 * rank above out-of-stock ones with the same score. Firestore has no text
 * search; the catalog is in memory anyway (CollectionSnapshot).
 */
export function searchCatalog(catalog: Product[], query: string, limit: number): Product[] {
  const wanted = [...new Set(tokens(query))];
  if (wanted.length === 0) return [];
  const exactSku = normalizeSearch(query);
  const needed = Math.max(1, Math.ceil(wanted.length * 0.6));

  const scored: { product: Product; score: number }[] = [];
  for (const item of indexOf(catalog)) {
    if (item.sku === exactSku) {
      scored.push({ product: item.product, score: 1000 });
      continue;
    }
    let score = 0;
    let matched = 0;
    for (const word of wanted) {
      if (item.words.includes(word)) {
        score += 2;
        matched++;
      } else if (
        word.length >= 3 &&
        item.words.some((w) => w.startsWith(word) || (w.length >= 3 && word.startsWith(w)))
      ) {
        score += 1;
        matched++;
      }
    }
    if (matched >= needed) scored.push({ product: item.product, score });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.product.stock > 0) - Number(a.product.stock > 0) ||
        a.product.name.localeCompare(b.product.name, 'es'),
    )
    .slice(0, limit)
    .map((s) => s.product);
}
