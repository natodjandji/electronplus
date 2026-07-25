import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderItemInputDto } from './purchase-order-item-input.dto';

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  supplierName: string;

  @IsArray()
  @ArrayMinSize(1)
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
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
