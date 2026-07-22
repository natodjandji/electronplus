import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';

/**
 * Never rejects the request: attaches req.user when a valid Firebase ID
 * token is present, otherwise leaves req.user undefined. Used by routes
 * (e.g. QR scan) that serve different payloads to anonymous vs.
 * authenticated callers.
 */
@Injectable()
export class OptionalFirebaseAuthGuard extends FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch {
      return true;
    }
  }
}
