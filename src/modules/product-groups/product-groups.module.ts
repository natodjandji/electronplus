import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';

@Module({
  imports: [ProductsModule],
  controllers: [ProductGroupsController],
  providers: [ProductGroupsService],
  exports: [ProductGroupsService],
})
export class ProductGroupsModule {}
