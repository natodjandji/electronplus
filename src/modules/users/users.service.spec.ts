import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { Role } from '../../common/enums/role.enum';
import { EMAIL_VERIFICATION_REQUESTED_EVENT, UsersService } from './users.service';

describe('UsersService.update', () => {
  function setup(account: { emailVerified: boolean; email?: string }) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.USERS, 'u1', { email: 'ana@example.com', role: Role.CLIENT });
    const auth = {
      getUser: jest.fn().mockResolvedValue({ uid: 'u1', displayName: 'Ana', ...account }),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    const events = new EventEmitter2();
    const requested = jest.fn();
    events.on(EMAIL_VERIFICATION_REQUESTED_EVENT, requested);
    const service = new UsersService(firestore as never, auth as never, events);
    const read = () => firestore.read(Collections.USERS, 'u1');
    return { service, auth, requested, read, firestore };
  }

  it('gives a staff role only to an account with a verified email', async () => {
    const { service, auth, read } = setup({ emailVerified: true, email: 'ana@example.com' });
    await service.update('u1', { role: Role.SELLER });
    expect(read()).toMatchObject({ role: Role.SELLER });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: Role.SELLER });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });

  it('refuses an unverified account and sends it a verification link instead', async () => {
    const { service, auth, requested, read } = setup({
      emailVerified: false,
      email: 'ana@example.com',
    });
    await expect(service.update('u1', { role: Role.SELLER })).rejects.toThrow(BadRequestException);
    expect(requested).toHaveBeenCalledWith({ email: 'ana@example.com', displayName: 'Ana' });
    expect(read()).toMatchObject({ role: Role.CLIENT });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('can always move someone back to client', async () => {
    const { service, auth, read } = setup({ emailVerified: false });
    await service.update('u1', { role: Role.CLIENT });
    expect(read()).toMatchObject({ role: Role.CLIENT });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('never grants admin from the panel', async () => {
    const { service } = setup({ emailVerified: true, email: 'ana@example.com' });
    await expect(service.update('u1', { role: Role.ADMIN })).rejects.toThrow(ForbiddenException);
  });

  it('does not create a user for an unknown id', async () => {
    const { service, firestore } = setup({ emailVerified: true });
    await expect(service.update('ghost', { active: false })).rejects.toThrow(NotFoundException);
    expect(firestore.read(Collections.USERS, 'ghost')).toBeUndefined();
  });
});
