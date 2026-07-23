import { Type } from 'class-transformer';
import {
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
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  state: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateNested()
  @Type(() => ShippingInfoDto)
  shipping: ShippingInfoDto;

  /** Bank/pago-móvil/Zelle confirmation reference, when applicable. */
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
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
