import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PricingService } from './pricing.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PricingService, CategoriesService, WarehousesService],
  exports: [ProductsService, PricingService, CategoriesService, WarehousesService],
})
export class ProductsModule {}
