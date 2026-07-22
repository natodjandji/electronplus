import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkLabelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds: string[];
}
