import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LISTING_TYPES } from '../mercasist.types';

export class UpdateMercasistSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  syncPrice?: boolean;

  @IsOptional()
  @IsBoolean()
  syncStock?: boolean;

  @IsOptional()
  @IsBoolean()
  syncContent?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewProducts?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  safetyStock?: number;

  @IsOptional()
  @IsIn(LISTING_TYPES, { message: 'Tipo de publicación inválido' })
  listingType?: string;
}

export class MercasistExportQueryDto {
  /** Which group of `tamano` products (1 is the first); all when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lote?: number;

  /** Products per file — Mercasist's trial takes 20 at a time. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  tamano?: number;
}
