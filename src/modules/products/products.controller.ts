import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { cacheIfAnonymous } from '../../common/http/public-cache';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../../common/guards/optional-firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CategoriesService } from './categories.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { AdminQueryProductsDto } from './dto/admin-query-products.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { toCatalogDto } from './mappers/product.mapper';
import { PricingService } from './pricing.service';
import { ProductsService } from './products.service';
import { WarehousesService } from './warehouses.service';

@ApiTags('products')
@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
    private readonly categoriesService: CategoriesService,
    private readonly warehousesService: WarehousesService,
  ) {}

  @Get('categories')
  categories(@Res({ passthrough: true }) res: Response) {
    cacheIfAnonymous(res, undefined, 300);
    return this.categoriesService.findAll();
  }

  @Post('categories')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto.code, dto.label);
  }

  @Get('warehouses')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  @ApiBearerAuth()
  warehouses() {
    return this.warehousesService.findAll();
  }

  @Get('products')
  @UseGuards(OptionalFirebaseAuthGuard)
  async findAll(
    @Query() query: QueryProductsDto,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const result = await this.productsService.findAll(query);
    cacheIfAnonymous(res, user);
    return {
      ...result,
      data: result.data.map((p) => toCatalogDto(p, user?.role, this.pricingService)),
    };
  }

  /** Every active product in one response — the storefront's catalog,
   * collections, quote builder and chat assistant all filter it in the
   * browser. Served from memory (ProductsService.activeCatalog), so its
   * Firestore cost doesn't grow with traffic. */
  @Get('products/catalog')
  @UseGuards(OptionalFirebaseAuthGuard)
  async catalog(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const products = await this.productsService.activeCatalog();
    cacheIfAnonymous(res, user);
    return { data: products.map((p) => toCatalogDto(p, user?.role, this.pricingService)) };
  }

  @Get('products/admin')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  adminFindAll(@Query() query: AdminQueryProductsDto) {
    return this.productsService.adminFindAll(query);
  }

  @Get('products/best-sellers')
  @UseGuards(OptionalFirebaseAuthGuard)
  async bestSellers(
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const products = await this.productsService.topSelling(limit ? Number(limit) : undefined);
    cacheIfAnonymous(res, user);
    return products.map((p) => toCatalogDto(p, user?.role, this.pricingService));
  }

  @Get('products/:id')
  @UseGuards(OptionalFirebaseAuthGuard)
  async findOne(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const product = await this.productsService.findPublicById(id);
    // An unlisted product is as good as gone to customers — the cart drops
    // it on this 404, and checkout refuses it (assertPurchasable).
    if (!product.active && user?.role !== Role.ADMIN && user?.role !== Role.WAREHOUSE_OPERATOR) {
      throw new NotFoundException('Product not found');
    }
    cacheIfAnonymous(res, user);
    return toCatalogDto(product, user?.role, this.pricingService);
  }

  @Post('products')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch('products/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(204)
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  remove(@Param('id') id: string) {
    return this.productsService.delete(id);
  }

  @Patch('products/:id/stock')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  @ApiBearerAuth()
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.productsService.adjustStock(id, dto);
  }

  @Get('products/:id/stock-by-warehouse')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  @ApiBearerAuth()
  stockByWarehouse(@Param('id') id: string) {
    return this.productsService.stockByWarehouse(id);
  }
}
