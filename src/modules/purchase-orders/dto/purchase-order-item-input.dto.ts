import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class PurchaseOrderItemInputDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantityOrdered: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPerItem?: number;
}
