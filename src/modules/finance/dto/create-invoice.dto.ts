import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  supplierName: string;

  @IsString()
  invoiceNumber: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  dueDate: string;
}
