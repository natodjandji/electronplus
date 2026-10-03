import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CommaSeparated, TimestampPeriodQueryDto } from '../../../common/dto/period-query.dto';
import { QuoteStatus } from '../entities/quote.entity';

export class QueryQuotesDto extends TimestampPeriodQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @CommaSeparated()
  @IsEnum(QuoteStatus, { each: true })
  status?: QuoteStatus[];
}
