import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dto/update-discount-code.dto';
import { ValidateDiscountCodeDto } from './dto/validate-discount-code.dto';
import { DiscountCodesService } from './discount-codes.service';

@ApiTags('discount-codes')
@ApiBearerAuth()
@Controller('discount-codes')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DiscountCodesController {
  constructor(private readonly discountCodesService: DiscountCodesService) {}

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.discountCodesService.list();
  }

  @Get('validate')
  validate(@Query() dto: ValidateDiscountCodeDto) {
    return this.discountCodesService.validate(dto.code, dto.subtotal);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateDiscountCodeDto) {
    return this.discountCodesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateDiscountCodeDto) {
    return this.discountCodesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    await this.discountCodesService.delete(id);
  }
}
