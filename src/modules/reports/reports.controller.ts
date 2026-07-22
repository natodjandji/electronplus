import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DateRangeDto } from './dto/date-range.dto';
import { ReportsService } from './reports.service';

function resolveRange(dto: DateRangeDto): { from: Date; to: Date } {
  const to = dto.to ? new Date(dto.to) : new Date();
  const from = dto.from ? new Date(dto.from) : new Date(new Date().setMonth(to.getMonth() - 1));
  return { from, to };
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales-series')
  salesSeries() {
    return this.reportsService.salesSeries();
  }

  @Get('category-share')
  categoryShare() {
    return this.reportsService.categoryShare();
  }

  @Get('cashflow')
  cashFlow(@Query() dto: DateRangeDto) {
    const { from, to } = resolveRange(dto);
    return this.reportsService.cashFlow(from, to);
  }

  @Get('profitability')
  profitability(@Query() dto: DateRangeDto) {
    const { from, to } = resolveRange(dto);
    return this.reportsService.profitability(from, to);
  }
}
