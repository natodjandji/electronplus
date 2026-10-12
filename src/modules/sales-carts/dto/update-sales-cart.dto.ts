import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { PriceList } from '../entities/sales-cart.entity';
import { SalesCartCustomerDto } from './sales-cart-customer.dto';

export class UpdateSalesCartDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesCartCustomerDto)
  customer?: SalesCartCustomerDto;

  @IsOptional()
  @IsEnum(PriceList)
  priceList?: PriceList;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;
}
