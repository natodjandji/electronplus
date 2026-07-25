import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaymentsService } from './payments.service';

class RejectPaymentDto {
  @IsString()
  reason: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findByOrder(orderId, user);
  }

  @Post(':id/paypal/capture')
  capturePaypal(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.capturePaypal(id, user);
  }

  @Patch(':id/verify')
  @Roles(Role.ADMIN)
  verify(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.verifyManual(id, user.id);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.paymentsService.reject(id, user.id, dto.reason);
  }
}
