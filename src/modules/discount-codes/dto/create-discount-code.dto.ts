import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
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

  /** Last valid day, YYYY-MM-DD. Omitted or null: never expires. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresOn must be a YYYY-MM-DD date' })
  expiresOn?: string | null;

  /** Omitted or null: unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsBoolean()
  oncePerCustomer?: boolean;
}
