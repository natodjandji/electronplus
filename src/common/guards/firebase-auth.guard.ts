import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { Role } from '../enums/role.enum';

function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  const [scheme, token] = authHeader.split(' ');
  return scheme === 'Bearer' ? token : undefined;
}

export const USER_CREATED_EVENT = 'user.created';

/** How long a staff token's revocation check is trusted before asking
 * Firebase Auth again — a demotion or deactivation locks the account out
 * within this window instead of when the ID token expires (up to 1h). */
const STAFF_REVOCATION_CHECK_TTL_MS = 60_000;
const STAFF_ROLES: readonly string[] = [Role.ADMIN, Role.WAREHOUSE_OPERATOR];
/** Token → time its revocation check stops counting. Shared by every guard
 * instance; one admin session fires bursts of requests with one token. */
const staffTokensCheckedUntil = new Map<string, number>();

export interface UserCreatedEvent {
  uid: string;
  email: string;
  displayName?: string;
}

/**
 * Verifies a Firebase ID token. Role normally comes straight off the token's
 * `role` custom claim — zero Firestore reads. That claim is only missing for
 * a brand-new sign-in or a user whose token predates claims being
 * introduced; only then does this fall back to the users/{uid} Firestore doc
 * (creating it on first sign-in) and backfill the claim so every request
 * after their next token refresh skips Firestore entirely. See
 * UsersService.update() for where the claim is kept in sync on role changes.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly events: EventEmitter2,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(token);
      if (STAFF_ROLES.includes(decoded.role)) await this.assertStaffTokenNotRevoked(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }

    request.user = await this.resolveUser(decoded);
    return true;
  }

  /** A plain verifyIdToken only checks the signature, so a staff token
   * keeps its role claim for up to an hour after UsersService demotes or
   * deactivates the account (and revokes its sessions). Checking that
   * costs an Auth lookup, so it's done for staff only — whose tokens
   * unlock the panel — and cached briefly per token. */
  private async assertStaffTokenNotRevoked(token: string): Promise<void> {
    const now = Date.now();
    if ((staffTokensCheckedUntil.get(token) ?? 0) > now) return;
    await this.auth.verifyIdToken(token, true);
    if (staffTokensCheckedUntil.size > 1000) {
      for (const [cached, until] of staffTokensCheckedUntil) {
        if (until <= now) staffTokensCheckedUntil.delete(cached);
      }
    }
    staffTokensCheckedUntil.set(token, now + STAFF_REVOCATION_CHECK_TTL_MS);
  }

  private async resolveUser(decoded: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
    role?: string;
  }) {
    if (decoded.role && (Object.values(Role) as string[]).includes(decoded.role)) {
      return { id: decoded.uid, email: decoded.email ?? '', role: decoded.role as Role };
    }
    return this.loadOrCreateUserAndBackfillClaim(decoded);
  }

  private async loadOrCreateUserAndBackfillClaim(decoded: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  }) {
    const ref = this.firestore.collection(Collections.USERS).doc(decoded.uid);
    const snap = await ref.get();

    let role: Role;
    if (!snap.exists) {
      role = Role.CLIENT;
      const now = FieldValue.serverTimestamp();
      await ref.set({
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
        role,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      if (decoded.email) {
        this.events.emit(USER_CREATED_EVENT, {
          uid: decoded.uid,
          email: decoded.email,
          displayName: decoded.name,
        } satisfies UserCreatedEvent);
      }
    } else {
      if (snap.data()!.active === false) {
        throw new UnauthorizedException('This account is deactivated');
      }
      role = snap.data()!.role as Role;
    }

    // Best-effort — the request still succeeds with the freshly-read role
    // even if this write fails; it'll just fall back to Firestore again
    // next time instead of using the (still-missing) claim.
    this.auth.setCustomUserClaims(decoded.uid, { role }).catch(() => undefined);

    return { id: decoded.uid, email: decoded.email ?? '', role };
  }
}
