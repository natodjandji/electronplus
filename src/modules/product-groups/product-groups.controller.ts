import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../../common/guards/optional-firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { cacheIfAnonymous } from '../../common/http/public-cache';
import { toCatalogDto } from '../products/mappers/product.mapper';
import { PricingService } from '../products/pricing.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';
import { ProductGroupsService } from './product-groups.service';

@ApiTags('product-groups')
@Controller('product-groups')
export class ProductGroupsController {
  constructor(
    private readonly groups: ProductGroupsService,
    private readonly pricingService: PricingService,
  ) {}

  @Get()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  list() {
    return this.groups.list();
  }

  /** Public: what a group label's QR opens, for anyone, and what a seller's
   * scan of it lists. Each product goes out as on the catalog, so only an
   * admin sees costs. */
  @Get(':id')
  @UseGuards(OptionalFirebaseAuthGuard)
  async findOne(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const group = await this.groups.getPublic(id);
    cacheIfAnonymous(res, user);
    return {
      id: group.id,
      name: group.name,
      products: group.products.map((p) => toCatalogDto(p, user?.role, this.pricingService)),
    };
  }

  @Post()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  create(@Body() dto: CreateProductGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() dto: UpdateProductGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  remove(@Param('id') id: string) {
    return this.groups.delete(id);
  }
}
