import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { EnvConfig } from '../../config/env.validation';
import { ProductsService } from '../products/products.service';
import { buildMetaCatalog } from './meta-catalog';
import { buildSitemap } from './sitemap';

@ApiExcludeController()
@Controller()
export class SitemapController {
  constructor(
    private readonly products: ProductsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Served as the storefront's /sitemap.xml through a Firebase Hosting
   * rewrite (firebase.json), which is why it sits outside the /api prefix
   * (main.ts). Built from the in-memory catalog snapshot, so a crawl costs
   * no Firestore reads, and the Hosting CDN keeps it for an hour. */
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  async sitemap(): Promise<string> {
    const products = await this.products.activeCatalog();
    return buildSitemap(this.config.get('PUBLIC_SITE_URL', { infer: true }), products);
  }

  /** The Meta catalog's data feed (see meta-catalog.ts), served as the
   * storefront's /meta-catalog.csv the same way. Commerce Manager fetches
   * it on a schedule; 15 minutes of CDN cache matches the Profit Plus sync. */
  @Get('meta-catalog.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=900, s-maxage=900')
  async metaCatalog(): Promise<string> {
    const products = await this.products.activeCatalog();
    return buildMetaCatalog(this.config.get('PUBLIC_SITE_URL', { infer: true }), products);
  }
}
