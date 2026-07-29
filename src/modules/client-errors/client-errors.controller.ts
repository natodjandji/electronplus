import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClientErrorsService } from './client-errors.service';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

/**
 * Unauthenticated by design: a crashed frontend (including one that can't
 * reach FirebaseAuthGuard, e.g. auth itself is the thing that broke) still
 * needs to be able to report what happened. Logged to Cloud Run stdout
 * (queryable via `gcloud logging read`) rather than Firestore — this is a
 * debugging aid, not a feature with a UI, and doesn't need the durability
 * or query flexibility a database would cost writes for.
 */
@ApiTags('client-errors')
@Controller('client-errors')
export class ClientErrorsController {
  constructor(private readonly clientErrorsService: ClientErrorsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(204)
  report(@Body() dto: ReportClientErrorDto): void {
    this.clientErrorsService.log(dto);
  }
}
