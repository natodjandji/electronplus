import { PartialType } from '@nestjs/swagger';
import { CreateSecondStoreProductDto } from './create-second-store-product.dto';

export class UpdateSecondStoreProductDto extends PartialType(CreateSecondStoreProductDto) {}
