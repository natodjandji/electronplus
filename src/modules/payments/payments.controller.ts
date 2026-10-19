import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CasheaConfirmDto, CasheaDownPaymentDto, CasheaReturnDto } from './dto/cashea.dto';
import { PaymentsService } from './payments.service';

class RejectPaymentDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Whether checkout can offer Cashea, and its minimum purchase. */
  @Get('cashea/config')
  casheaConfig() {
    return this.paymentsService.casheaConfig();
  }

  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findByOrder(orderId, user);
  }

  /** The buyer is back from Cashea with the purchase approved. */
  @Post('order/:orderId/cashea/return')
  casheaReturn(
    @Param('orderId') orderId: string,
    @Body() dto: CasheaReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.casheaReturn(orderId, dto.idNumber, user);
  }

  @Post(':id/cashea/down-payment')
  casheaDownPayment(
    @Param('id') id: string,
    @Body() dto: CasheaDownPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.casheaReportDownPayment(id, user, dto);
  }

  @Post(':id/cashea/confirm')
  @Roles(Role.ADMIN)
  casheaConfirm(
    @Param('id') id: string,
    @Body() dto: CasheaConfirmDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.casheaConfirm(id, user.id, dto.amount);
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
