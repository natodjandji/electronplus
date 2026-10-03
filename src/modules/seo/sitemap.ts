import { Product } from '../products/entities/product.entity';

/** Indexable storefront pages that have their own prerendered HTML — keep in
 * step with PUBLIC_PAGES in frontend/vite.config.ts. Everything private is
 * left out here and disallowed in frontend/public/robots.txt. */
export const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/catalog', changefreq: 'daily', priority: '0.9' },
  { path: '/collections', changefreq: 'weekly', priority: '0.7' },
] as const;

/** The sitemap protocol's cap per file. A catalog that ever outgrows it
 * needs a sitemap index; until then the extra products are left out. */
export const MAX_SITEMAP_URLS = 50_000;

interface Entry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
  image?: string;
}

/** Every indexable page: the static ones plus one per active product, with
 * its last update and photo (the image extension lets Google Images find
 * them too). `products` should already be the active ones only. */
export function buildSitemap(siteUrl: string, products: Product[]): string {
  const base = siteUrl.replace(/\/+$/, '');
  const entries: Entry[] = [
    ...STATIC_PAGES.map((page) => ({
      loc: `${base}${page.path}`,
      changefreq: page.changefreq,
      priority: page.priority,
    })),
    ...products.slice(0, MAX_SITEMAP_URLS - STATIC_PAGES.length).map((product) => ({
      loc: `${base}/product/${encodeURIComponent(product.id)}`,
      lastmod: calendarDate(product.updatedAt),
      changefreq: 'weekly',
      priority: '0.6',
      image: product.imageUrl,
    })),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries.map(renderEntry),
    '</urlset>',
    '',
  ].join('\n');
}

function renderEntry(entry: Entry): string {
  return [
    '  <url>',
    `    <loc>${escapeXml(entry.loc)}</loc>`,
    entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    entry.image
      ? `    <image:image><image:loc>${escapeXml(entry.image)}</image:loc></image:image>`
      : null,
    '  </url>',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function calendarDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
