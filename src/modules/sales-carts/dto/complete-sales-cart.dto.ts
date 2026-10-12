import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteSalesCartDto {
  /** The Profit Plus invoice number, for tracing the sale later. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceRef?: string;
}
