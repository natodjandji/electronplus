import { Module } from '@nestjs/common';
import { ShippingRatesController } from './shipping-rates.controller';
import { ShippingRatesService } from './shipping-rates.service';

@Module({
  controllers: [ShippingRatesController],
  providers: [ShippingRatesService],
  exports: [ShippingRatesService],
})
export class ShippingRatesModule {}
