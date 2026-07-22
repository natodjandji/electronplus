import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { RegisterPurchaseOrderPaymentDto } from './dto/register-purchase-order-payment.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import { UpdatePurchaseOrderItemsDto } from './dto/update-purchase-order-items.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseOrdersService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: QueryPurchaseOrdersDto) {
    return this.purchaseOrdersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findById(id);
  }

  @Get(':id/payments')
  listPayments(@Param('id') id: string) {
    return this.purchaseOrdersService.listPayments(id);
  }

  @Patch(':id/items')
  updateItems(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderItemsDto) {
    return this.purchaseOrdersService.updateItems(id, dto);
  }

  @Patch(':id/payment-terms')
  updatePaymentTerms(@Param('id') id: string, @Body() dto: UpdatePaymentTermsDto) {
    return this.purchaseOrdersService.updatePaymentTerms(id, dto);
  }

  @Post(':id/issue')
  issue(@Param('id') id: string) {
    return this.purchaseOrdersService.issue(id);
  }

  @Post(':id/payments')
  registerPayment(
    @Param('id') id: string,
    @Body() dto: RegisterPurchaseOrderPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.registerPayment(id, dto, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.purchaseOrdersService.cancel(id);
  }
}
