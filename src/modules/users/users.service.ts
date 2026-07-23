import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { Role } from '../../common/enums/role.enum';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

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
    return this.repo.update(uid, dto);
  }

  async updateProfile(uid: string, dto: UpdateProfileDto): Promise<User> {
    return this.repo.update(uid, dto);
  }
}
