import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '../../common/enums/role.enum';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, snapshotToEntity } from '../../firebase/firestore.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export const EMAIL_VERIFICATION_REQUESTED_EVENT = 'user.email-verification.requested';

export interface EmailVerificationRequestedEvent {
  email: string;
  displayName?: string;
}

export interface UserPage {
  data: User[];
  /** Pass as `after` for the next page; null on the last one. */
  nextCursor: string | null;
  total: number;
}

@Injectable()
export class UsersService {
  private readonly repo: FirestoreRepository<User>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    private readonly events: EventEmitter2,
  ) {
    this.repo = new FirestoreRepository<User>(firestore, Collections.USERS);
  }

  /** One page of a role's users, newest first, continuing after the user
   * with id `after`. The panel used to load every account on each visit —
   * a list that grows with every customer who ever signs in; this reads one
   * page plus a count (1 read per 1,000 users). */
  async findPageByRole(role: Role, pageSize: number, after?: string): Promise<UserPage> {
    let query = this.repo.collection().where('role', '==', role).orderBy('createdAt', 'desc');
    if (after) {
      const cursor = await this.repo.doc(after).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const [snap, total] = await Promise.all([
      query.limit(pageSize).get(),
      this.repo.count([{ field: 'role', op: '==', value: role }]),
    ]);
    const data = snap.docs.map((doc) => snapshotToEntity<User>(doc));
    return {
      data,
      nextCursor: data.length === pageSize ? data[data.length - 1].id : null,
      total,
    };
  }

  /** Every seller account — few, so one query without paging. */
  findSellers(): Promise<User[]> {
    return this.repo.findAll({ where: [{ field: 'role', op: '==', value: Role.SELLER }] });
  }

  /** Operational alert emails (low stock, invoice/expense due) go to every
   * admin, not just one hardcoded address — filtered in Firestore rather
   * than by loading every user. */
  findAdmins(): Promise<User[]> {
    return this.repo.findAll({ where: [{ field: 'role', op: '==', value: Role.ADMIN }] });
  }

  findById(uid: string): Promise<User> {
    return this.repo.getOrThrow(uid, 'User not found');
  }

  async findByEmail(email: string): Promise<User> {
    // Firebase Auth is the source of truth for email -> uid; the Firestore
    // doc id already is the uid (see FirebaseAuthGuard), so this is one hop.
    const userRecord = await this.auth.getUserByEmail(email);
    return this.findById(userRecord.uid);
  }

  /** The admin role can never be granted through the app — only by a direct
   * change outside of it, so privilege escalation isn't a self-service UI action. */
  async update(uid: string, dto: UpdateUserDto): Promise<User> {
    if (dto.role === Role.ADMIN) {
      throw new ForbiddenException('The admin role cannot be granted from the panel');
    }
    // repo.update() is a set-merge: on an unknown id it would create a
    // half-made user before Firebase Auth refused the role change.
    await this.repo.getOrThrow(uid, 'User not found');
    if (dto.role && dto.role !== Role.CLIENT) await this.assertEmailVerified(uid);
    const updated = await this.repo.update(uid, dto);
    if (dto.role) {
      // Keeps FirebaseAuthGuard's role custom claim in sync.
      await this.auth.setCustomUserClaims(uid, { role: updated.role });
    }
    if (dto.active !== undefined) {
      await this.auth.updateUser(uid, { disabled: !dto.active });
    }
    if (dto.role || dto.active === false) {
      // Ends every session now, so the user signs in again under the new
      // role (or can't). Until then their current ID token still carries
      // the old claim — FirebaseAuthGuard rejects it for staff tokens,
      // the ones that could do harm with it.
      await this.auth.revokeRefreshTokens(uid);
    }
    return updated;
  }

  /** A staff role opens the seller tool — quotes with the store's name and
   * any discount — so it only goes to an account whose email is proven.
   * Anyone can register an unverified account under an employee's address
   * and wait to be promoted. Google sign-ins arrive verified; an
   * email-and-password account is sent a verification link, and the role
   * can be set once it's confirmed. */
  private async assertEmailVerified(uid: string): Promise<void> {
    const account = await this.auth.getUser(uid);
    if (account.emailVerified) return;
    if (!account.email) {
      throw new BadRequestException('Este usuario no tiene un correo verificado.');
    }
    this.events.emit(EMAIL_VERIFICATION_REQUESTED_EVENT, {
      email: account.email,
      displayName: account.displayName,
    } satisfies EmailVerificationRequestedEvent);
    throw new BadRequestException(
      'Este usuario todavía no verificó su correo. Le enviamos un enlace para verificarlo; cuando lo confirme, vuelve a asignarle el rol.',
    );
  }

  async updateProfile(uid: string, dto: UpdateProfileDto): Promise<User> {
    return this.repo.update(uid, dto);
  }
}
