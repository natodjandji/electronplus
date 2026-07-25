import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

/**
 * Verifies a Firebase ID token, then reads (or lazily creates, on first
 * sign-in) the matching users/{uid} Firestore doc, attaching the app-level
 * profile — including role — to req.user.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly firestore: Firestore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }

    request.user = await this.loadOrCreateUser(decoded);
    return true;
  }

  private async loadOrCreateUser(decoded: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  }) {
    const ref = this.firestore.collection(Collections.USERS).doc(decoded.uid);
    const snap = await ref.get();

    if (!snap.exists) {
      const now = FieldValue.serverTimestamp();
      await ref.set({
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
        role: Role.CLIENT,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: decoded.uid,
        email: decoded.email ?? '',
        role: Role.CLIENT,
      };
    }

    const data = snap.data()!;
    return {
      id: decoded.uid,
      email: data.email ?? decoded.email ?? '',
      role: data.role as Role,
    };
  }
}
