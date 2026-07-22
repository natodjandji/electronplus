import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RegisterPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  method: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
