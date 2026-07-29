import { IsOptional, IsString } from 'class-validator';

export class RejectQuoteDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
