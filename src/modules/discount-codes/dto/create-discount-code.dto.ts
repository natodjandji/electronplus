import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { DiscountType } from '../entities/discount-code.entity';

export class CreateDiscountCodeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'code must contain only letters, numbers and hyphens' })
  code: string;

  @IsEnum(DiscountType)
  type: DiscountType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
