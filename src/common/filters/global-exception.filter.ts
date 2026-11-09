import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

/**
 * Errors raised before a request reaches Nest (body-parser's 413 for a body
 * over the limit, 415 for an unsupported charset, 400 for an aborted upload)
 * aren't HttpExceptions. They follow the http-errors convention instead: a
 * 4xx `status`, with `expose: true` when the message is safe to show.
 * Without this they all came back as a 500.
 */
function clientHttpError(exception: unknown): { status: number; message: string } | null {
  if (!(exception instanceof Error)) return null;
  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  if (expose !== true || typeof status !== 'number' || status < 400 || status >= 500) return null;
  return { status, message: exception.message };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let body: string | object;
    const clientError = clientHttpError(exception);
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = exception.getResponse();
    } else if (clientError) {
      status = clientError.status;
      body = { message: clientError.message, error: STATUS_CODES[status] };
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      body = { message: 'Internal server error' };
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'object' ? body : { message: body }),
    });
  }
}
