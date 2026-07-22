import { IsInt, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  /** Positive to add stock, negative to remove. */
  @IsInt()
  delta: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
