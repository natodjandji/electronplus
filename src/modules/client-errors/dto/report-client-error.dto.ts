import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportClientErrorDto {
  @IsString()
  @MaxLength(2_000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mechanism?: string;
}
