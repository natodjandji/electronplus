import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CollectionSnapshot,
  LoadOptions,
  SNAPSHOT_REBUILD_INTERVAL_MS,
} from '../../firebase/collection-snapshot';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { SecondStoreProduct } from './entities/second-store-product.entity';

/** Every reader here is an admin screen or the sync job: always re-check
 * (one read) and keep the snapshot rebuilt daily. */
export const SECOND_STORE_LOAD: LoadOptions = {
  maxAgeMs: 0,
  rebuildIfOlderThanMs: SNAPSHOT_REBUILD_INTERVAL_MS,
};

/**
 * The whole secondStoreProducts collection (~5.4k docs) packed into a few
 * docs — see CollectionSnapshot. Listing it in the admin and matching it in
 * every sync run used to read every document each time, which was nearly
 * all of the project's Firestore reads. Shared by SecondStoreService (admin
 * CRUD) and SecondStoreSyncService (bridge sync), which both keep it current.
 */
@Injectable()
export class SecondStoreIndex extends CollectionSnapshot<SecondStoreProduct> {
  constructor(@Inject(FIRESTORE) firestore: Firestore) {
    super(firestore, Collections.SECOND_STORE_PRODUCTS, () =>
      firestore.collection(Collections.SECOND_STORE_PRODUCTS),
    );
  }
}
