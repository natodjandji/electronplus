import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class AddSalesCartItemDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[^/]+$/)
  productId: string;

  /** Units to add on top of what's already in the cart (a scan adds 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  qty?: number;
}
