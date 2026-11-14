import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';
import { ProductGroup } from './entities/product-group.entity';

/** Letters and digits a person can read off a URL without mixing them up
 * (no 0/o, 1/l/i). */
const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
/** 8 characters of 31: about 850 billion ids. Short, so the printed QR has
 * fewer, larger modules and scans from further away. */
const ID_LENGTH = 8;

export function newGroupId(): string {
  const bytes = randomBytes(ID_LENGTH);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export interface PublicProductGroup {
  id: string;
  name: string;
  /** The group's products that are on sale, in the group's order. One that
   * was deactivated or deleted since is left out. */
  products: Product[];
}

@Injectable()
export class ProductGroupsService {
  private readonly repo: FirestoreRepository<ProductGroup>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly productsService: ProductsService,
  ) {
    this.repo = new FirestoreRepository<ProductGroup>(firestore, Collections.PRODUCT_GROUPS);
  }

  async list(): Promise<ProductGroup[]> {
    const groups = await this.repo.findAll();
    return groups.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  getOrThrow(id: string): Promise<ProductGroup> {
    return this.repo.getOrThrow(id, 'Grupo no encontrado');
  }

  async findByIds(ids: string[]): Promise<ProductGroup[]> {
    return this.repo.findByIds(ids);
  }

  /** What the group's QR opens. Served from the in-memory catalog: a scan
   * costs one read, the group's, whatever it holds. */
  async getPublic(id: string): Promise<PublicProductGroup> {
    const group = await this.getOrThrow(id);
    const catalog = new Map((await this.productsService.activeCatalog()).map((p) => [p.id, p]));
    return {
      id: group.id,
      name: group.name,
      products: group.productIds.flatMap((pid) => catalog.get(pid) ?? []),
    };
  }

  async create(dto: CreateProductGroupDto): Promise<ProductGroup> {
    const data = {
      name: this.cleanName(dto.name),
      productIds: await this.checkProducts(dto.productIds),
    };
    // A collision is one in hundreds of billions; three tries is plenty.
    for (let attempt = 0; attempt < 3; attempt++) {
      const created = await this.repo.createIfAbsent(data, newGroupId());
      if (created) return created;
    }
    throw new Error('No se pudo generar un código de grupo libre');
  }

  async update(id: string, dto: UpdateProductGroupDto): Promise<ProductGroup> {
    await this.getOrThrow(id);
    const patch: Partial<ProductGroup> = {};
    if (dto.name !== undefined) patch.name = this.cleanName(dto.name);
    if (dto.productIds !== undefined) patch.productIds = await this.checkProducts(dto.productIds);
    return this.repo.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.repo.delete(id);
  }

  private cleanName(name: string): string {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new BadRequestException('El grupo necesita un nombre');
    return clean;
  }

  /** Every id must be a product of the store; the order is kept. */
  private async checkProducts(productIds: string[]): Promise<string[]> {
    const found = new Set((await this.productsService.findByIds(productIds)).map((p) => p.id));
    const missing = productIds.filter((pid) => !found.has(pid));
    if (missing.length > 0) {
      throw new BadRequestException(`Productos que no existen: ${missing.join(', ')}`);
    }
    return productIds;
  }
}
