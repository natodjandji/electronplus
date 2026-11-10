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

/** A token keeps its role claim until it expires; the guard has to ask
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
  const revocationChecks = (verifyIdToken: jest.Mock) =>
    verifyIdToken.mock.calls.filter(([, check]) => check === true);

  it.each([Role.WAREHOUSE_OPERATOR, Role.SELLER, Role.CLIENT])(
    'rejects a revoked %s token',
    async (role) => {
      const { guard } = build(role, true);
      await expect(guard.canActivate(contextFor(`${role}-revoked`).context)).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );

  it.each([Role.ADMIN, Role.CLIENT])(
    'checks a %s token once, then trusts it briefly',
    async (role) => {
      const { guard, verifyIdToken } = build(role, false);
      const { context, request } = contextFor(`${role}-ok`);
      await guard.canActivate(context);
      await guard.canActivate(contextFor(`${role}-ok`).context);

      expect(request.user).toEqual({ id: 'u1', email: 'u@example.com', role });
      expect(verifyIdToken).toHaveBeenCalledTimes(2);
      expect(revocationChecks(verifyIdToken)).toHaveLength(1);
    },
  );

  it('shares one check between the requests a page fires at once', async () => {
    const { guard, verifyIdToken } = build(Role.CLIENT, false);
    const results = await Promise.all(
      [1, 2, 3].map(() => guard.canActivate(contextFor('client-burst').context)),
    );
    expect(results).toEqual([true, true, true]);
    expect(revocationChecks(verifyIdToken)).toHaveLength(1);
  });

  it('turns away every request waiting on a check that fails', async () => {
    const { guard, verifyIdToken } = build(Role.SELLER, true);
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => guard.canActivate(contextFor('seller-burst-off').context)),
    );
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(revocationChecks(verifyIdToken)).toHaveLength(1);
  });

  it('asks again once the check is a minute old', async () => {
    jest.useFakeTimers();
    try {
      const { guard, verifyIdToken } = build(Role.CLIENT, false);
      await guard.canActivate(contextFor('client-aging').context);
      jest.advanceTimersByTime(61_000);
      await guard.canActivate(contextFor('client-aging').context);
      expect(revocationChecks(verifyIdToken)).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not remember a token that failed its check', async () => {
    const { guard, verifyIdToken } = build(Role.CLIENT, true);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(guard.canActivate(contextFor('client-off').context)).rejects.toThrow(
        UnauthorizedException,
      );
    }
    expect(revocationChecks(verifyIdToken)).toHaveLength(2);
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
