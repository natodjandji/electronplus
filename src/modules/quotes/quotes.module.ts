import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ProductsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
