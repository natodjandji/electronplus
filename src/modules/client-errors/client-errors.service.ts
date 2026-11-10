import { Injectable, Logger } from '@nestjs/common';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

const CSP_MECHANISM = 'csp';

@Injectable()
export class ClientErrorsService {
  private readonly logger = new Logger('ClientError');

  log(dto: ReportClientErrorDto): void {
    const line = `${dto.route ?? 'unknown route'} · ${dto.mechanism ?? 'unknown'} · ${dto.message}`;
    // What the storefront's Content-Security-Policy blocked, or would have
    // (frontend/src/lib/csp-reports.ts): something to review, not a crash.
    if (dto.mechanism === CSP_MECHANISM) {
      this.logger.warn(dto.stack ? `${line} · ${dto.stack}` : line);
      return;
    }
    this.logger.error(line, dto.stack);
  }
}
