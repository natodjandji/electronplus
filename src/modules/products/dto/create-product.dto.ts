import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

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

  /** Empty string clears the product's image. Expected to be a Cloud Storage
   * URL from POST /uploads/product-image — a raw base64 data URI is still
   * accepted for backward compatibility with any client that hasn't
   * switched over to the upload endpoint yet. */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(
    /^(|data:image\/(png|jpe?g|webp);base64,.+|https:\/\/firebasestorage\.googleapis\.com\/.+)$/,
    {
      message: 'imageUrl must be a Cloud Storage URL or a base64 image data URI',
    },
  )
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
