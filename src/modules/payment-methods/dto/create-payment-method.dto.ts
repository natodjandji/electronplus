import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** The checkout key (Firestore doc id) and the internal PaymentMethod enum
 * are both derived server-side (see PaymentMethodsService.create) — an
 * admin configuring "how this pays" (label, details, reference/proof
 * requirements) has no reason to also pick backend plumbing that has
 * nothing to do with that decision. */
export class CreatePaymentMethodDto {
  @IsString()
  @MaxLength(100)
  label: string;

  @IsArray()
  @IsString({ each: true })
  details: string[];

  @IsBoolean()
  needsReference: boolean;

  @IsBoolean()
  needsProof: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
