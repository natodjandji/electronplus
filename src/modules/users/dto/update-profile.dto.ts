import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Self-service profile update — deliberately excludes role/credit/active,
 * which only an admin may change via PATCH /users/:id. Lengths match the
 * checkout's ShippingInfoDto, which these fields prefill. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

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
