import { Inject, Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository } from '../../firebase/firestore.repository';
import { ProductsService } from '../products/products.service';
import { SECOND_STORE_LOAD, SecondStoreIndex } from './second-store-index';
import { CreateSecondStoreProductDto } from './dto/create-second-store-product.dto';
import { UpdateSecondStoreProductDto } from './dto/update-second-store-product.dto';
import { SecondStoreProduct } from './entities/second-store-product.entity';

const nameCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

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

  private sorted: { source: SecondStoreProduct[]; byName: SecondStoreProduct[] } | null = null;

  constructor(
    @Inject(FIRESTORE) firestore: Firestore,
    private readonly productsService: ProductsService,
    private readonly index: SecondStoreIndex,
  ) {
    this.repo = new FirestoreRepository<SecondStoreProduct>(
      firestore,
      Collections.SECOND_STORE_PRODUCTS,
    );
  }

  /** Served from the snapshots on both sides — the ~5.4k rows and the
   * catalog products they link to — so the whole list costs about two reads
   * instead of one per row plus one per linked product. */
  async findAll(): Promise<SecondStoreProductWithLink[]> {
    const [items, products] = await Promise.all([
      this.index.load(SECOND_STORE_LOAD),
      this.productsService.catalogLookup(),
    ]);
    if (this.sorted?.source !== items) {
      const byName = [...items].sort((a, b) => nameCollator.compare(a.name, b.name));
      this.sorted = { source: items, byName };
    }

    return this.sorted.byName.map((item) => {
      const product = item.linkedProductId ? products.get(item.linkedProductId) : undefined;
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
    return this.indexed(await this.repo.create(dto));
  }

  async update(id: string, dto: UpdateSecondStoreProductDto): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    return this.indexed(await this.repo.update(id, dto));
  }

  async delete(id: string): Promise<void> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    await this.repo.delete(id);
    await this.index.apply({ remove: [id] });
  }

  async link(id: string, productId: string): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    await this.productsService.findById(productId); // throws if the product doesn't exist
    return this.indexed(await this.repo.update(id, { linkedProductId: productId }));
  }

  async unlink(id: string): Promise<SecondStoreProduct> {
    await this.repo.getOrThrow(id, 'Second store product not found');
    return this.indexed(
      await this.repo.update(id, { linkedProductId: FieldValue.delete() as never }),
    );
  }

  /** Every write re-reads the saved doc already (FirestoreRepository), so
   * the snapshot gets that exact copy. */
  private async indexed(saved: SecondStoreProduct): Promise<SecondStoreProduct> {
    await this.index.apply({ put: [saved] });
    return saved;
  }
}
