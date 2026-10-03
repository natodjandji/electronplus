import { IsEnum, IsOptional } from 'class-validator';
import { DatePeriodQueryDto } from '../../../common/dto/period-query.dto';
import { SupplierPayableStatus } from '../entities/supplier-payable.entity';

/** from/to bound the due date. */
export class QueryInvoicesDto extends DatePeriodQueryDto {
  @IsOptional()
  @IsEnum(SupplierPayableStatus)
  status?: SupplierPayableStatus;
}
