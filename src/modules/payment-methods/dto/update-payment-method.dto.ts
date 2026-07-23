import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  details?: string[];

  @IsOptional()
  @IsBoolean()
  needsReference?: boolean;

  @IsOptional()
  @IsBoolean()
  needsProof?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
