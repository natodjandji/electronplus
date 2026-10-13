import { Module } from '@nestjs/common';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { ProductsModule } from '../products/products.module';
import { QuotePdfService } from './quote-pdf.service';
import { QuotePdfsController } from './quote-pdfs.controller';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ProductsModule, ExchangeRateModule],
  controllers: [QuotesController, QuotePdfsController],
  providers: [QuotesService, QuotePdfService],
  exports: [QuotesService],
})
export class QuotesModule {}
