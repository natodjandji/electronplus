import { IsOptional, IsString } from 'class-validator';

export class AdminQueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** 'true' includes only products with a minStockThreshold set and stock at or below it. */
  @IsOptional()
  @IsString()
  lowStockOnly?: string;
}
