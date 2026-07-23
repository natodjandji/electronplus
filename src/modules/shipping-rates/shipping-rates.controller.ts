import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateShippingRateDto } from './dto/create-shipping-rate.dto';
import { QuoteShippingRateDto } from './dto/quote-shipping-rate.dto';
import { UpdateShippingRateDto } from './dto/update-shipping-rate.dto';
import { ShippingRatesService } from './shipping-rates.service';

@ApiTags('shipping-rates')
@ApiBearerAuth()
@Controller('shipping-rates')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ShippingRatesController {
  constructor(private readonly shippingRatesService: ShippingRatesService) {}

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.shippingRatesService.list();
  }

  @Get('quote')
  quote(@Query() dto: QuoteShippingRateDto) {
    return this.shippingRatesService.quote(dto.state, dto.city);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateShippingRateDto) {
    return this.shippingRatesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateShippingRateDto) {
    return this.shippingRatesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    await this.shippingRatesService.delete(id);
  }
}
