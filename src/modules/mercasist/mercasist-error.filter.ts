import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { MercasistError } from './mercasist.client';

/** Mercasist's refusals reach the panel with its message instead of a bare
 * 500: 503 while it isn't configured, 429 when its quota ran out, 502
 * otherwise (never its own status — its 401 isn't the admin's session
 * failing). The client's messages already say "Mercasist". */
@Catch(MercasistError)
export class MercasistErrorFilter implements ExceptionFilter {
  private readonly fallback = new GlobalExceptionFilter();

  catch(error: MercasistError, host: ArgumentsHost) {
    const status =
      error.status === 503
        ? HttpStatus.SERVICE_UNAVAILABLE
        : error.status === 429
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.BAD_GATEWAY;
    this.fallback.catch(new HttpException({ message: error.message }, status), host);
  }
}
