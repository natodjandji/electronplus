import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DatePeriodQueryDto } from '../../../common/dto/period-query.dto';
import { ExpenseStatus } from '../entities/expense.entity';

/** from/to bound the due date. */
export class QueryExpensesDto extends DatePeriodQueryDto {
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsString()
  category?: string;
}
