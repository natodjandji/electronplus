import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Cashea's order number, from the redirect back to the store. */
export class CasheaReturnDto {
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'idNumber must be Cashea’s order number' })
  idNumber: string;
}

/** The buyer's down payment: paid online through one of the store's
 * payment methods, or at the store when picking the order up. */
export class CasheaDownPaymentDto {
  @IsBoolean()
  atStore: boolean;

  /** The payment-methods panel entry it was paid through (online only). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  methodId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  /** Same cap and format as an order's payment proof. */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'proofBase64 must be a base64 image data URI',
  })
  proofBase64?: string;
}

/** The down payment the store received, as confirmed to Cashea. */
export class CasheaConfirmDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}
