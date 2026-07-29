import { Injectable, Logger } from '@nestjs/common';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

@Injectable()
export class ClientErrorsService {
  private readonly logger = new Logger('ClientError');

  log(dto: ReportClientErrorDto): void {
    this.logger.error(
      `${dto.route ?? 'unknown route'} · ${dto.mechanism ?? 'unknown'} · ${dto.message}`,
      dto.stack,
    );
  }
}
