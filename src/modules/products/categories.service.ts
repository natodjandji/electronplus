import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { slugify } from '../../common/utils/slug';
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

  /**
   * The category a Profit Plus item belongs to. With Profit's own category
   * code (`erpCode`) that code is the identity: a renamed category keeps its
   * id and its URL code — only its label changes, so its products stay
   * together instead of moving to a new category and leaving the old one
   * empty. A category already made from the same name (by an admin, or
   * before codes came through) is adopted rather than duplicated. Without
   * an `erpCode` it falls back to the name, as before.
   */
  async findOrCreateForErp(erpCode: string | undefined, label: string): Promise<Category> {
    const code = slugify(label) || 'sin-categoria';
    if (!erpCode) return this.findOrCreateByCode(code, label);

    const all = await this.findAll();
    const byErpCode =
      all.find((c) => c.erpCode === erpCode) ??
      (await this.repo.findOne([{ field: 'erpCode', op: '==', value: erpCode }]));
    if (byErpCode) {
      return byErpCode.label === label ? byErpCode : this.patchCategory(byErpCode, { label });
    }

    const sameName =
      all.find((c) => c.code === code) ??
      (await this.repo.findOne([{ field: 'code', op: '==', value: code }]));
    if (sameName && !sameName.erpCode) {
      return this.patchCategory(sameName, { erpCode, label });
    }
    // Another Profit category already has this name's URL code: keep both,
    // told apart by Profit's code.
    const freeCode = sameName ? `${code}-${slugify(erpCode) || 'erp'}` : code;
    const category = await this.repo.create({ code: freeCode, label, erpCode });
    this.cache = null;
    return category;
  }

  private async patchCategory(category: Category, fields: Partial<Category>): Promise<Category> {
    await this.repo.patch(category.id, fields);
    this.cache = null;
    return { ...category, ...fields };
  }
}
