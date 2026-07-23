import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import { SupplierPayableStatus } from './entities/supplier-payable.entity';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.financeService.createSupplier(dto);
  }

  @Get('suppliers')
  listSuppliers() {
    return this.financeService.listSuppliers();
  }

  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.financeService.createInvoice(dto);
  }

  @Get('invoices')
  listInvoices(@Query('status') status?: SupplierPayableStatus) {
    return this.financeService.listInvoices(status);
  }

  @Patch('invoices/:id/payment-terms')
  updatePaymentTerms(@Param('id') id: string, @Body() dto: UpdatePaymentTermsDto) {
    return this.financeService.updatePaymentTerms(id, dto);
  }

  @Get('invoices/:id/payments')
  listPayments(@Param('id') id: string) {
    return this.financeService.listPayments(id);
  }

  @Post('invoices/:id/payments')
  registerPayment(
    @Param('id') id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financeService.registerPayment(id, dto, user.id);
  }
}
