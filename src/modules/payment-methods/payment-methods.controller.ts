import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { cacheIfAnonymous } from '../../common/http/public-cache';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

/** Public: just the names of the methods anyone can pay with, for the
 * storefront's chat assistant. The full list (with account details) stays
 * behind sign-in below. */
@ApiTags('payment-methods')
@Controller('payment-methods')
export class PublicPaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get('public')
  async publicList(@Res({ passthrough: true }) res: Response) {
    cacheIfAnonymous(res, undefined, 300);
    return { labels: await this.paymentMethodsService.publicLabels() };
  }
}

@ApiTags('payment-methods')
@ApiBearerAuth()
@Controller('payment-methods')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  list() {
    return this.paymentMethodsService.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.paymentMethodsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    await this.paymentMethodsService.delete(id);
  }
}
