import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CommaSeparated, TimestampPeriodQueryDto } from '../../../common/dto/period-query.dto';
import { OrderStatus } from '../entities/order.entity';

export class QueryOrdersDto extends TimestampPeriodQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @CommaSeparated()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];
}
