import { IsIn, IsOptional } from 'class-validator';

export class QuerySalesCartsDto {
  /** open: carts in progress; completed: sales finished today. */
  @IsOptional()
  @IsIn(['open', 'completed'])
  status?: 'open' | 'completed';
}
