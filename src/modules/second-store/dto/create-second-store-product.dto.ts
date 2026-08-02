import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSecondStoreProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  linkedProductId?: string;
}
