import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReviewSourceDto {
  /** Kept for an answer that already exists, so its past reviews stay
   * grouped with it after a rename. Absent for a new one. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}

export class UpdateReviewSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReviewSourceDto)
  sources: ReviewSourceDto[];
}
