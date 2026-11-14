import { Module } from '@nestjs/common';
import { ProductGroupsModule } from '../product-groups/product-groups.module';
import { ProductsModule } from '../products/products.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  imports: [ProductsModule, ProductGroupsModule],
  controllers: [QrController],
  providers: [QrService],
})
export class QrModule {}
