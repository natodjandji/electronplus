import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AddSalesCartItemDto } from './dto/add-sales-cart-item.dto';
import { CompleteSalesCartDto } from './dto/complete-sales-cart.dto';
import { CreateSalesCartDto } from './dto/create-sales-cart.dto';
import { QuerySalesCartsDto } from './dto/query-sales-carts.dto';
import { UpdateSalesCartItemDto } from './dto/update-sales-cart-item.dto';
import { UpdateSalesCartDto } from './dto/update-sales-cart.dto';
import { SecondStoreService } from '../second-store/second-store.service';
import { SalesCartsService } from './sales-carts.service';

@ApiTags('sales-carts')
@ApiBearerAuth()
@Controller('sales-carts')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.SELLER, Role.ADMIN)
// Every scan is a request, and several sellers on the store's Wi-Fi share
// one IP — the global 100/min per IP would cut a busy counter off.
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class SalesCartsController {
  constructor(
    private readonly salesCarts: SalesCartsService,
    private readonly secondStore: SecondStoreService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalesCartDto) {
    return this.salesCarts.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySalesCartsDto) {
    return this.salesCarts.list(user, query.status);
  }

  /** The second store's stock per linked catalog product, shown to the
   * seller next to the main store's — never on the customer's quote.
   * Declared before ':id' so it isn't taken for a cart id. */
  @Get('second-store-stock')
  secondStoreStock() {
    return this.secondStore.stockByLinkedProduct();
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesCarts.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalesCartDto,
  ) {
    return this.salesCarts.update(user, id, dto);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddSalesCartItemDto,
  ) {
    return this.salesCarts.addItem(user, id, dto);
  }

  @Patch(':id/items/:productId')
  setItemQty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateSalesCartItemDto,
  ) {
    return this.salesCarts.setItemQty(user, id, productId, dto.qty);
  }

  @Post(':id/share')
  @HttpCode(200)
  share(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesCarts.share(user, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteSalesCartDto,
  ) {
    return this.salesCarts.complete(user, id, dto);
  }

  /** Cancels an open cart: it's deleted, not kept as a record. */
  @Delete(':id')
  @HttpCode(204)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.salesCarts.cancel(user, id);
  }
}
