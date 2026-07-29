import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddQuoteLineDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPct?: number;
}
