import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FulfillmentMethod } from '../entities/order.entity';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class OrderItemInputDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  qty: number;
}

export class ShippingInfoDto {
  @IsString()
  @MaxLength(200)
  fullName: string;

  @IsString()
  @MaxLength(50)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  /** Required for delivery orders — omitted for pickup. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  state?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsEnum(FulfillmentMethod)
  fulfillmentMethod?: FulfillmentMethod;

  @ValidateNested()
  @Type(() => ShippingInfoDto)
  shipping: ShippingInfoDto;

  /** Bank/pago-móvil/Zelle confirmation reference, when applicable. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  discountCode?: string;

  /** Payment proof screenshot as a data URI — capped well under Firestore's
   * 1MiB document limit (the client compresses the image before sending). */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'paymentProofBase64 must be a base64 image data URI',
  })
  paymentProofBase64?: string;
}
