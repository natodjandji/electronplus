import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { EnvConfig } from '../../config/env.validation';

/** Whether Cloud Scheduler drives the periodic jobs — see
 * SCHEDULER_INVOKER_EMAIL in env.validation.ts. */
export function cloudSchedulerEnabled(config: ConfigService<EnvConfig, true>): boolean {
  return Boolean(
    config.get('SCHEDULER_INVOKER_EMAIL', { infer: true }) &&
    config.get('SCHEDULER_AUDIENCE', { infer: true }),
  );
}

/**
 * Lets through only Cloud Scheduler: a Google-signed OIDC token minted for
 * this API's audience on behalf of the configured service account. The API
 * itself is public on Cloud Run, so this check is the endpoints' only lock.
 * With Scheduler not configured the endpoints answer 404, as if absent.
 */
@Injectable()
export class SchedulerAuthGuard implements CanActivate {
  private readonly oidc = new OAuth2Client();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!cloudSchedulerEnabled(this.config)) throw new NotFoundException();

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token) throw new UnauthorizedException();

    try {
      const ticket = await this.oidc.verifyIdToken({
        idToken: token,
        audience: this.config.get('SCHEDULER_AUDIENCE', { infer: true }),
      });
      const payload = ticket.getPayload();
      if (
        payload?.email_verified &&
        payload.email === this.config.get('SCHEDULER_INVOKER_EMAIL', { infer: true })
      ) {
        return true;
      }
    } catch {
      // Bad signature, wrong audience, expired — all the same 401 below.
    }
    throw new UnauthorizedException();
  }
}
