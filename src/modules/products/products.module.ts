import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PricingService } from './pricing.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PricingService, CategoriesService],
  exports: [ProductsService, PricingService, CategoriesService],
})
export class ProductsModule {}
