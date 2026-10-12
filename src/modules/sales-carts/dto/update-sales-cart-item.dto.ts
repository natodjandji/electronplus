import { IsInt, Max, Min } from 'class-validator';

export class UpdateSalesCartItemDto {
  /** The line's new quantity; 0 removes it. */
  @IsInt()
  @Min(0)
  @Max(9999)
  qty: number;
}
