import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';
import { ShippingInfoDto } from './create-order.dto';

/** Checks an approved quote out into a real order — items and pricing come
 * from the quote itself (locked in at the negotiated discount), so this
 * only needs the checkout details a normal CreateOrderDto doesn't already
 * get from the quote: no items, no discountCode. */
export class CreateOrderFromQuoteDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateNested()
  @Type(() => ShippingInfoDto)
  shipping: ShippingInfoDto;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'paymentProofBase64 must be a base64 image data URI',
  })
  paymentProofBase64?: string;
}
