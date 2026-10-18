import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MaxLength(60)
  sourceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceOther?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sellerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @Matches(/^0\d{3}-\d{7}$/, { message: 'El teléfono debe tener el formato 0414-1234567.' })
  customerPhone?: string;

  /** Honeypot: hidden on the form, so only a bot fills it in. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
