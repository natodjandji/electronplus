import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CommaSeparated, TimestampPeriodQueryDto } from '../../../common/dto/period-query.dto';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export class QueryPurchaseOrdersDto extends TimestampPeriodQueryDto {
  @IsOptional()
  @CommaSeparated()
  @IsEnum(PurchaseOrderStatus, { each: true })
  status?: PurchaseOrderStatus[];

  @IsOptional()
  @IsString()
  supplierId?: string;
}
