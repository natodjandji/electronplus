import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { DiscountType } from '../entities/discount-code.entity';

export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
