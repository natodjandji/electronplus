import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class RegisterPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  method: string;

  @IsOptional()
  @IsString()
  reference?: string;

  /** Payment proof screenshot as a data URI — mirrors CreateOrderDto.paymentProofBase64. */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'proofBase64 must be a base64 image data URI',
  })
  proofBase64?: string;
}
