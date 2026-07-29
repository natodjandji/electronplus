import { IsNumber, Min } from 'class-validator';

export class UpdateShippingRateDto {
  @IsNumber()
  @Min(0)
  amount: number;
}
