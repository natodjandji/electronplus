import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  sku: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  specs?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsNumber()
  @Min(0)
  retailPrice: number;

  @IsNumber()
  @Min(0)
  wholesalePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStockThreshold?: number;

  /** Empty string clears the product's image — only a non-empty value has to look like one. */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^(data:image\/(png|jpe?g|webp);base64,.+)?$/, {
    message: 'imageUrl must be a base64 image data URI',
  })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
