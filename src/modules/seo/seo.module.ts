import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { SitemapController } from './sitemap.controller';

@Module({
  imports: [ProductsModule],
  controllers: [SitemapController],
})
export class SeoModule {}
