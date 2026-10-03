import { IsInt, IsString, Min } from 'class-validator';

export class AddQuoteLineDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  qty: number;
}
