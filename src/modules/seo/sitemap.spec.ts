import { Product } from '../products/entities/product.entity';
import { buildSitemap, MAX_SITEMAP_URLS, STATIC_PAGES } from './sitemap';

const product = (id: string, overrides: Partial<Product> = {}) =>
  ({
    id,
    name: id,
    updatedAt: new Date('2026-10-02T15:00:00Z'),
    ...overrides,
  }) as Product;

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

describe('buildSitemap', () => {
  it('lists the static pages, then one URL per product with its last update', () => {
    const xml = buildSitemap('https://electronplus.com.ve/', [
      product('breaker-20a'),
      product('cable-12-awg', { imageUrl: 'https://cdn.example/cable.webp?a=1&b=2' }),
    ]);

    expect(locs(xml)).toEqual([
      'https://electronplus.com.ve/',
      'https://electronplus.com.ve/catalog',
      'https://electronplus.com.ve/collections',
      'https://electronplus.com.ve/product/breaker-20a',
      'https://electronplus.com.ve/product/cable-12-awg',
    ]);
    expect(xml).toContain('<lastmod>2026-10-02</lastmod>');
    // Query strings in image URLs must be escaped or the XML is invalid.
    expect(xml).toContain('<image:loc>https://cdn.example/cable.webp?a=1&amp;b=2</image:loc>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('omits lastmod when a product has no usable date', () => {
    const xml = buildSitemap('https://x.test', [product('a', { updatedAt: undefined as never })]);
    expect(xml).not.toContain('<lastmod>');
  });

  it('stays within the protocol limit of 50,000 URLs per file', () => {
    const many = Array.from({ length: MAX_SITEMAP_URLS + 10 }, (_, i) => product(`p${i}`));
    expect(locs(buildSitemap('https://x.test', many))).toHaveLength(MAX_SITEMAP_URLS);
    expect(STATIC_PAGES.length).toBeGreaterThan(0);
  });
});
