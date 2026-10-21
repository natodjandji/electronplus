import type { Product } from '../../products/entities/product.entity';
import { normalizeSearch, searchCatalog } from './product-search';

function product(id: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    sku: id.toUpperCase(),
    name,
    categoryId: 'c',
    category: { id: 'c', code: 'ilu', label: 'Iluminación' },
    retailPrice: 1,
    wholesalePrice: 1,
    stock: 10,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

const catalog = [
  product('b9', 'Bombillo LED 9W Luz Blanca', { brand: 'Sylvania' }),
  product('b12', 'Bombillo LED 12W Luz Cálida', { brand: 'Philips', stock: 0 }),
  product('b12b', 'Bombillo LED 12W Luz Blanca', { brand: 'Ecolite' }),
  product('c12', 'Cable THHN 12 AWG Rojo', { category: { id: 'k', code: 'cab', label: 'Cables' } }),
  product('br20', 'Breaker 2x20A Enchufable'),
];

const ids = (found: Product[]) => found.map((p) => p.id);

describe('normalizeSearch', () => {
  it('lowercases, drops accents and glues units to their number', () => {
    expect(normalizeSearch('Bombillo LED 9 W Cálida')).toBe('bombillo led 9w calida');
    expect(normalizeSearch('12 watts')).toBe('12w');
    expect(normalizeSearch('cable 2,5 mm')).toBe('cable 2_5mm');
  });
});

describe('searchCatalog', () => {
  it('finds plurals and units the way customers type them', () => {
    expect(ids(searchCatalog(catalog, 'bombillos de 9 watts', 10))).toEqual(['b9']);
    expect(ids(searchCatalog(catalog, 'bombillo 12w', 10))).toEqual(['b12b', 'b12']);
  });

  it('ranks in-stock products first when the match is the same', () => {
    expect(ids(searchCatalog(catalog, 'bombillo led 12w', 10))[0]).toBe('b12b');
  });

  it('matches the brand, the category and accented words', () => {
    expect(ids(searchCatalog(catalog, 'philips', 10))).toEqual(['b12']);
    expect(ids(searchCatalog(catalog, 'luz calida', 10))).toEqual(['b12']);
    expect(ids(searchCatalog(catalog, 'cables thhn', 10))).toEqual(['c12']);
  });

  it('puts an exact product code first', () => {
    expect(ids(searchCatalog(catalog, 'BR20', 10))).toEqual(['br20']);
  });

  it('needs most of the words to match, and honors the limit', () => {
    expect(searchCatalog(catalog, 'tablero trifasico 12 circuitos', 10)).toEqual([]);
    expect(searchCatalog(catalog, 'bombillo', 2)).toHaveLength(2);
    expect(searchCatalog(catalog, 'de la', 10)).toEqual([]);
  });
});
