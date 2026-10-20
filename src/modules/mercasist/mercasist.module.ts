import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { MercasistClient } from './mercasist.client';
import { MercasistController } from './mercasist.controller';
import { MercasistService } from './mercasist.service';
import { MercasistSyncService } from './mercasist-sync.service';

@Module({
  imports: [ProductsModule],
  controllers: [MercasistController],
  providers: [MercasistClient, MercasistService, MercasistSyncService],
  exports: [MercasistClient, MercasistSyncService],
})
export class MercasistModule {}
