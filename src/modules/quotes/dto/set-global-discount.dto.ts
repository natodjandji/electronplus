import { IsInt, Max, Min } from 'class-validator';

export class SetGlobalDiscountDto {
  @IsInt()
  @Min(0)
  @Max(100)
  globalDiscountPct: number;
}
