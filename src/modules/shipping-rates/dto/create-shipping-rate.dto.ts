import { IsNumber, IsString, Min } from 'class-validator';

export class CreateShippingRateDto {
  @IsString()
  state: string;

  /** Use "*" for a state-wide default rate. */
  @IsString()
  city: string;

  @IsNumber()
  @Min(0)
  amount: number;
}
