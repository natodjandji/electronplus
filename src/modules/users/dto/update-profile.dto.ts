import { IsOptional, IsString } from 'class-validator';

/** Self-service profile update — deliberately excludes role/credit/active,
 * which only an admin may change via PATCH /users/:id. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
