import { Inject, Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { ProductsService } from '../products/products.service';
import { CreateSecondStoreProductDto } from './dto/create-second-store-product.dto';
import { UpdateSecondStoreProductDto } from './dto/update-second-store-product.dto';
import { SecondStoreProduct } from './entities/second-store-product.entity';

export interface SecondStoreProductWithLink extends SecondStoreProduct {
  linkedProduct: { id: string; sku: string; name: string; stock: number } | null;
}

/**
 * `stock`/`retailPrice`/`wholesalePrice` here can each be set two ways:
 * manually via update() below, or by SecondStoreSyncService's scheduled
 * pull from profit-plus-bridge-secundaria (see that file's doc comment for
 * the code/name matching rules). Both stay available at once, same
 * tradeoff the primary catalog already accepts between its own ERP sync
 * and ProductsController's manual adjustStock endpoint: whichever wrote
 * last wins, and the next scheduled sync overwrites the ERP-owned fields
 * again.
 */

@Injectable()
export class SecondStoreService {
  private readonly repo: FirestoreRepository<SecondStoreProduct>;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly productsService: ProductsService,
  ) {
    this.repo = new FirestoreRepository<SecondStoreProduct>(
      firestore,
      Collections.SECOND_STORE_PRODUCTS,
    );
  }

  async findAll(): Promise<SecondStoreProductWithLink[]> {
    const items = await this.repo.findAll({ orderBy: { field: 'name' } });

    // Batch-resolve every linked product in one round trip instead of one
    // findById per row (the naive Promise.all(items.map(...)) approach).
    const linkedIds = items.flatMap((item) => (item.linkedProductId ? [item.linkedProductId] : []));
    const linkedProducts = await this.productsService.findByIds(linkedIds);
    const byId = new Map(linkedProducts.map((p) => [p.id, p]));

    return items.map((item) => {
      const product = item.linkedProductId ? byId.get(item.linkedProductId) : undefined;
      return {
        ...item,
        // Linked product may have been deleted after linking — surface as unlinked rather than failing the list.
        linkedProduct: product
          ? { id: product.id, sku: product.sku, name: product.name, stock: product.stock }
          : null,
      };
    });
  }

  /**
   * The second-store row linked to a given catalog product, or null.
   *
   * Exists so a caller that only needs ONE product's link (the product
   * detail page's ops-only "Stock tienda secundaria" figure) doesn't pull
   * the whole catalog and `.find()` in memory — that was ~5.4k document
   * reads to render a single number, on every product page view by an
   * admin/almacenista. This is an indexed single-field equality query with
   * limit 1, so it costs 1 read regardless of catalog size.
   */
  async findByLinkedProductId(productId: string): Promise<SecondStoreProduct | null> {
    return this.repo.findOne([{ field: 'linkedProductId', op: '==', value: productId }]);
  }

  async findById(id: string): Promise<SecondStoreProductWithLink> {
    const item = await this.repo.getOrThrow(id, 'Second store product not found');
    if (!item.linkedProductId) return { ...item, linkedProduct: null };
    try {
      const product = await this.productsService.findById(item.linkedProductId);
      return {
        ...item,
        linkedProduct: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          stock: product.stock,
        },
      };
    } catch {
      // Linked product was deleted after linking — surface as unlinked rather than failing the list.
      return { ...item, linkedProduct: null };
    }
  }

  async create(dto: CreateSecondStoreProductDto): Promise<SecondStoreProduct> {
    if (dto.linkedProductId) {
      await this.productsService.findById(dto.linkedProductId); // throws if the product doesn't exist
    }
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateSecondStoreProductDto): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    return this.repo.update(id, dto);
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    await this.repo.delete(id);
  }

  async link(id: string, productId: string): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    await this.productsService.findById(productId); // throws if the product doesn't exist
    return this.repo.update(id, { linkedProductId: productId });
  }

  async unlink(id: string): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    return this.repo.update(id, { linkedProductId: FieldValue.delete() as never });
  }
}
