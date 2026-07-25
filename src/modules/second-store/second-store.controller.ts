import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSecondStoreProductDto } from './dto/create-second-store-product.dto';
import { LinkSecondStoreProductDto } from './dto/link-second-store-product.dto';
import { UpdateSecondStoreProductDto } from './dto/update-second-store-product.dto';
import { SecondStoreService } from './second-store.service';

@ApiTags('second-store')
@ApiBearerAuth()
@Controller('second-store-products')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
export class SecondStoreController {
  constructor(private readonly secondStoreService: SecondStoreService) {}

  @Get()
  findAll() {
    return this.secondStoreService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateSecondStoreProductDto) {
    return this.secondStoreService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateSecondStoreProductDto) {
    return this.secondStoreService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.secondStoreService.delete(id);
  }

  @Post(':id/link')
  @Roles(Role.ADMIN)
  link(@Param('id') id: string, @Body() dto: LinkSecondStoreProductDto) {
    return this.secondStoreService.link(id, dto.productId);
  }

  @Post(':id/unlink')
  @Roles(Role.ADMIN)
  unlink(@Param('id') id: string) {
    return this.secondStoreService.unlink(id);
  }
}
