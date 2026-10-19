import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { cacheIfAnonymous } from '../../common/http/public-cache';
import { PaymentsService } from './payments.service';

/** Public: whether the storefront can promote Cashea for online purchases. */
@ApiTags('payments')
@Controller('cashea')
export class CasheaController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('status')
  async status(@Res({ passthrough: true }) res: Response) {
    cacheIfAnonymous(res, undefined, 300);
    return this.paymentsService.casheaPublicStatus();
  }
}
