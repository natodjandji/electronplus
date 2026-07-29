import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class ValidateDiscountCodeDto {
  @IsString()
  code: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal: number;
}
