import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderItemInputDto } from './purchase-order-item-input.dto';

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  @MaxLength(200)
  supplierName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items: PurchaseOrderItemInputDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
