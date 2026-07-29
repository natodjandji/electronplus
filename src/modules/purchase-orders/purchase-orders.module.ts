import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { ProductsModule } from '../products/products.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [ProductsModule, FinanceModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
