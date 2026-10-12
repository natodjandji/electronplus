import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { SalesCartCustomerDto } from './sales-cart-customer.dto';

export class CreateSalesCartDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesCartCustomerDto)
  customer?: SalesCartCustomerDto;
}
