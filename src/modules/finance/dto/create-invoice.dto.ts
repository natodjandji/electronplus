import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  @MaxLength(200)
  supplierName: string;

  @IsString()
  @MaxLength(100)
  invoiceNumber: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;
}
