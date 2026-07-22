import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly repo: FirestoreRepository<Category>;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<Category>(firestore, Collections.CATEGORIES);
  }

  findAll(): Promise<Category[]> {
    return this.repo.findAll({ orderBy: { field: 'label' } });
  }

  create(code: string, label: string): Promise<Category> {
    return this.repo.create({ code, label });
  }

  async findOrCreateByCode(code: string, label: string): Promise<Category> {
    const existing = await this.repo.findOne([{ field: 'code', op: '==', value: code }]);
    if (existing) return existing;
    return this.create(code, label);
  }
}
