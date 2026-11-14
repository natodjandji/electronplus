import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

/** A group needs two products to be one; forty is already more than a
 * shelf label can stand for. */
export const MIN_GROUP_PRODUCTS = 2;
export const MAX_GROUP_PRODUCTS = 40;

export class CreateProductGroupDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsArray()
  @ArrayMinSize(MIN_GROUP_PRODUCTS)
  @ArrayMaxSize(MAX_GROUP_PRODUCTS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  productIds: string[];
}
