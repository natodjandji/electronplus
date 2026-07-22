import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExchangeRateService } from './exchange-rate.service';

@ApiTags('exchange-rate')
@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get('bcv')
  getBcvRate() {
    return this.exchangeRateService.getBcvRate();
  }
}
