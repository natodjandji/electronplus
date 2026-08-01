import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseFrequency } from '../entities/expense.entity';

export class CreateExpenseDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  category: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(ExpenseFrequency)
  frequency: ExpenseFrequency;

  /** For `once`, the payment date. For `monthly`/`annual`, the first upcoming due date. */
  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
