import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { toOrderDto } from './mappers/order.mapper';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    const order = await this.ordersService.create(user, dto);
    return toOrderDto(order, user.role);
  }

  @Get('mine')
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    const orders = await this.ordersService.findMine(user);
    return orders.map((o) => toOrderDto(o, user.role));
  }

  @Get()
  @Roles(Role.ADMIN)
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query('userId') userId?: string) {
    const orders = await this.ordersService.findAll(userId);
    return orders.map((o) => toOrderDto(o, user.role));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.ordersService.findById(id, user);
    return toOrderDto(order, user.role);
  }

  @Patch(':id/advance')
  @Roles(Role.ADMIN, Role.WAREHOUSE_OPERATOR)
  async advance(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.ordersService.advanceStatus(id);
    return toOrderDto(order, user.role);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.ordersService.cancel(id);
    return toOrderDto(order, user.role);
  }
}
