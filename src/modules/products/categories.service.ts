import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Category } from './entities/category.entity';

/** Categories only change when a new one is created (admin form or an ERP
 * sync meeting a new code), and this instance drops its copy right then. The
 * TTL only bounds how long another instance can miss a new category. */
const CATEGORIES_CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class CategoriesService {
  private readonly repo: FirestoreRepository<Category>;
  /** GET /categories is public (collections page, chat assistant) and every
   * ERP sync resolves each item's category — uncached, both re-read the
   * whole collection on every call. */
  private cache: { data: Category[]; cachedAt: number } | null = null;

  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    this.repo = new FirestoreRepository<Category>(firestore, Collections.CATEGORIES);
  }

  async findAll(): Promise<Category[]> {
    const cached = this.cache;
    if (cached && Date.now() - cached.cachedAt < CATEGORIES_CACHE_TTL_MS) return cached.data;
    const data = await this.repo.findAll({ orderBy: { field: 'label' } });
    this.cache = { data, cachedAt: Date.now() };
    return data;
  }

  async create(code: string, label: string): Promise<Category> {
    const category = await this.repo.create({ code, label });
    this.cache = null;
    return category;
  }

  async findOrCreateByCode(code: string, label: string): Promise<Category> {
    const known = (await this.findAll()).find((c) => c.code === code);
    if (known) return known;
    // Not in this instance's copy — may still have been created elsewhere
    // within the TTL, so check the source before creating a duplicate.
    const existing = await this.repo.findOne([{ field: 'code', op: '==', value: code }]);
    if (existing) {
      this.cache = null;
      return existing;
    }
    return this.create(code, label);
  }
}
