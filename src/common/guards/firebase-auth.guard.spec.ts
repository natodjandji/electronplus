import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Role } from '../enums/role.enum';
import { Collections } from '../../firebase/firestore-collections';
import { FirebaseAuthGuard, USER_CREATED_EVENT } from './firebase-auth.guard';

function contextFor(token: string) {
  const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

/** A staff token keeps its role claim until it expires; the guard has to ask
 * Firebase Auth whether it was revoked (demotion, deactivation). */
describe('FirebaseAuthGuard revocation checks', () => {
  function build(role: Role, revoked: boolean) {
    const verifyIdToken = jest.fn((_token: string, checkRevoked?: boolean) => {
      if (checkRevoked && revoked) return Promise.reject(new Error('auth/id-token-revoked'));
      return Promise.resolve({ uid: 'u1', email: 'u@example.com', role });
    });
    const guard = new FirebaseAuthGuard(
      { verifyIdToken } as never,
      new FakeFirestore() as never,
      new EventEmitter2(),
    );
    return { guard, verifyIdToken };
  }

  it('rejects a revoked staff token', async () => {
    const { guard } = build(Role.WAREHOUSE_OPERATOR, true);
    await expect(guard.canActivate(contextFor('staff-revoked').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('checks a staff token once, then trusts it briefly', async () => {
    const { guard, verifyIdToken } = build(Role.ADMIN, false);
    await guard.canActivate(contextFor('staff-ok').context);
    await guard.canActivate(contextFor('staff-ok').context);

    const revocationChecks = verifyIdToken.mock.calls.filter(([, check]) => check === true);
    expect(revocationChecks).toHaveLength(1);
  });

  it('skips the revocation lookup for client tokens', async () => {
    const { guard, verifyIdToken } = build(Role.CLIENT, true);
    const { context, request } = contextFor('client-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'u@example.com', role: Role.CLIENT });
    expect(verifyIdToken.mock.calls.some(([, check]) => check === true)).toBe(false);
  });
});

/** A first sign-in fires several requests at once, each finding no profile. */
describe('FirebaseAuthGuard first sign-in', () => {
  function build() {
    const firestore = new FakeFirestore();
    const events = new EventEmitter2();
    const welcomed = jest.fn();
    events.on(USER_CREATED_EVENT, welcomed);
    const guard = new FirebaseAuthGuard(
      {
        verifyIdToken: () => Promise.resolve({ uid: 'new-user', email: 'n@example.com' }),
        setCustomUserClaims: () => Promise.resolve(),
      } as never,
      firestore as never,
      events,
    );
    return { guard, firestore, welcomed };
  }

  it('creates the profile once and sends one welcome email, however many requests race', async () => {
    const { guard, firestore, welcomed } = build();
    const results = await Promise.all(
      [1, 2, 3].map((n) => guard.canActivate(contextFor(`first-${n}`).context)),
    );

    expect(results).toEqual([true, true, true]);
    expect(welcomed).toHaveBeenCalledTimes(1);
    expect(firestore.read(Collections.USERS, 'new-user')).toMatchObject({
      role: Role.CLIENT,
      active: true,
    });
  });

  it('still refuses a deactivated account found on the way', async () => {
    const { guard, firestore } = build();
    firestore.seed(Collections.USERS, 'new-user', { role: Role.CLIENT, active: false });
    await expect(guard.canActivate(contextFor('deactivated').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
