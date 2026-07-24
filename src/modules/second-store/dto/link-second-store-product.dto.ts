import { IsString } from 'class-validator';

export class LinkSecondStoreProductDto {
  @IsString()
  productId: string;
}
