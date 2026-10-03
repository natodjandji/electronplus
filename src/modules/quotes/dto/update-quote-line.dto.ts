import { IsInt, Min } from 'class-validator';

/** Customers only change quantities — discounts are the admin's to grant
 * (PATCH :id/discount, POST :id/wholesale), never something a customer
 * can write onto their own lines. */
export class UpdateQuoteLineDto {
  @IsInt()
  @Min(1)
  qty: number;
}
