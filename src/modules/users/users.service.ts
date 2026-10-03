import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '../../common/enums/role.enum';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, snapshotToEntity } from '../../firebase/firestore.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

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
  ) {
    this.repo = new FirestoreRepository<User>(firestore, Collections.USERS);
  }

  findAll(): Promise<User[]> {
    return this.repo.findAll({ orderBy: { field: 'createdAt', direction: 'desc' } });
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

  /** Operational alert emails (low stock, invoice/expense due) go to every
   * admin, not just one hardcoded address — a Firestore-side filter instead
   * of fetching findAll() and filtering in memory. */
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

  async updateProfile(uid: string, dto: UpdateProfileDto): Promise<User> {
    return this.repo.update(uid, dto);
  }
}
