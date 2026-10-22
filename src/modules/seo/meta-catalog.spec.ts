import { Product } from '../products/entities/product.entity';
import { buildMetaCatalog, META_CATALOG_COLUMNS } from './meta-catalog';

const product = (id: string, overrides: Partial<Product> = {}) =>
  ({
    id,
    sku: id.toUpperCase(),
    name: id,
    retailPrice: 10,
    stock: 5,
    imageUrl: `https://cdn.example/${id}.webp`,
    category: { id: 'c1', code: 'ILU', label: 'Iluminación' },
    ...overrides,
  }) as Product;

/** Splits the CSV the way Meta reads it: quoted fields may hold commas,
 * quotes (doubled) and line breaks. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  return rows;
}

const rowsById = (csv: string) => {
  const [header, ...rows] = parseCsv(csv);
  return Object.fromEntries(
    rows.map((r) => [r[0], Object.fromEntries(header.map((h, i) => [h, r[i]]))]),
  );
};

describe('buildMetaCatalog', () => {
  it('starts with the columns Meta reads', () => {
    expect(parseCsv(buildMetaCatalog('https://electronplus.com.ve', []))).toEqual([
      [...META_CATALOG_COLUMNS],
    ]);
  });

  it('lists each product with its dollar price with IVA, stock and page', () => {
    const rows = rowsById(
      buildMetaCatalog('https://electronplus.com.ve/', [
        product('led-9w', { name: 'Bombillo LED 9W', retailPrice: 2.5, brand: 'Sylvania' }),
        product('breaker-20a', { stock: 0, specs: 'Breaker termomagnético 1 polo' }),
      ]),
    );
    expect(rows['led-9w']).toEqual({
      id: 'led-9w',
      title: 'Bombillo LED 9W',
      description: 'Bombillo LED 9W',
      availability: 'in stock',
      condition: 'new',
      price: '2.90 USD',
      link: 'https://electronplus.com.ve/product/led-9w',
      image_link: 'https://cdn.example/led-9w.webp',
      brand: 'Sylvania',
      product_type: 'Iluminación',
    });
    expect(rows['breaker-20a']).toMatchObject({
      availability: 'out of stock',
      description: 'Breaker termomagnético 1 polo',
      price: '11.60 USD',
      brand: 'Electron Plus',
    });
  });

  it('rounds the price with IVA to the cent, halves up', () => {
    // 1.25 × 1.16 = 1.45 exactly on paper, 1.4499… in floating point.
    expect(
      rowsById(buildMetaCatalog('https://x.ve', [product('a', { retailPrice: 1.25 })])).a.price,
    ).toBe('1.45 USD');
  });

  it('leaves out products without a photo, which Meta rejects', () => {
    const csv = buildMetaCatalog('https://x.ve', [
      product('con-foto'),
      product('sin-foto', { imageUrl: undefined }),
    ]);
    expect(Object.keys(rowsById(csv))).toEqual(['con-foto']);
  });

  it('keeps commas, quotes and line breaks inside their field', () => {
    const name = 'Cable THHN 12, rollo de 100 m "negro"';
    const specs = 'Calibre 12 AWG\nCobre, 600 V';
    const rows = rowsById(buildMetaCatalog('https://x.ve', [product('cable', { name, specs })]));
    expect(rows.cable).toMatchObject({ title: name, description: specs });
  });
});
