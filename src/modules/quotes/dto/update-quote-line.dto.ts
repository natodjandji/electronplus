import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateQuoteLineDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPct?: number;
}
