import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';
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

  /** null removes the expiry. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresOn must be a YYYY-MM-DD date' })
  expiresOn?: string | null;

  /** null removes the limit. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;
}
