import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  imports: [ProductsModule],
  controllers: [QrController],
  providers: [QrService],
})
export class QrModule {}
