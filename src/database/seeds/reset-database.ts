import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { AppModule } from '../../app.module';
import {
  FIREBASE_AUTH,
  FIREBASE_STORAGE_BUCKET,
  FIRESTORE,
} from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';

const logger = new Logger('ResetDatabase');

/** The one account every run of this script keeps — everyone else in
 * Firebase Auth + the users collection gets deleted. Change this if the
 * account that should survive a reset ever changes. */
const PRESERVED_ADMIN_EMAIL = 'electronplusve@gmail.com';

/**
 * Wipes every transactional/operational collection — quotes, orders,
 * payments, purchase orders + their payment subcollections, suppliers'
 * payables, notifications, stock alerts, sync logs, daily sales summaries,
 * second-store items, expenses — plus every user (Auth + Firestore) except
 * PRESERVED_ADMIN_EMAIL, plus the payment-proof Storage folder. Run once,
 * deliberately, right before a store goes live for real, NOT as a routine
 * dev-cleanup command.
 *
 * Deliberately NEVER touches (unless --include-products is also passed):
 *   - categories / warehouses / suppliers / paymentMethods / shippingRates /
 *     discountCodes — this is store config, not "test data"; wiping it
 *     breaks checkout until it's reconfigured. If any of these genuinely
 *     hold placeholder rows, remove those specific documents by hand from
 *     the Firebase console instead of scripting it.
 *   - products — same reasoning, EXCEPT when the catalog itself is still
 *     just seed/demo rows (run-seed.ts) with no real ERP-synced inventory
 *     yet, in which case --include-products clears it out too, on the
 *     assumption the real catalog will repopulate via ApiProfitPlusAdapter
 *     once that's connected.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/reset-database.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/reset-database.ts --confirm
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/reset-database.ts --confirm --include-products
 *
 * Without --confirm it only prints what it *would* delete — running it
 * blind against a live store is exactly the kind of irreversible mistake
 * this flag exists to prevent.
 */
const TRANSACTIONAL_COLLECTIONS = [
  Collections.QUOTES,
  Collections.ORDERS,
  Collections.PAYMENTS,
  Collections.PURCHASE_ORDERS,
  Collections.SUPPLIERS_PAYABLES,
  Collections.NOTIFICATIONS,
  Collections.STOCK_ALERTS,
  Collections.SYNC_LOGS,
  Collections.SALES_DAILY_SUMMARIES,
  Collections.SECOND_STORE_PRODUCTS,
  Collections.EXPENSES,
] as const;

// Subcollections aren't covered by a top-level collection delete — each
// parent doc's own subcollection has to be walked separately.
const SUBCOLLECTIONS: { parent: string; sub: string }[] = [
  { parent: Collections.SUPPLIERS_PAYABLES, sub: Collections.SUPPLIER_PAYMENTS },
  { parent: Collections.PURCHASE_ORDERS, sub: Collections.PURCHASE_ORDER_PAYMENTS },
];

async function deleteCollection(
  firestore: Firestore,
  path: string,
  dryRun: boolean,
): Promise<number> {
  const snap = await firestore.collection(path).get();
  if (dryRun || snap.empty) return snap.size;
  const batchSize = 400; // stay under Firestore's 500-write batch limit
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = firestore.batch();
    for (const doc of snap.docs.slice(i, i + batchSize)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.size;
}

async function deleteSubcollections(
  firestore: Firestore,
  parentCollection: string,
  subName: string,
  dryRun: boolean,
): Promise<number> {
  const parents = await firestore.collection(parentCollection).listDocuments();
  let total = 0;
  for (const parent of parents) {
    total += await deleteCollection(firestore, `${parent.path}/${subName}`, dryRun);
  }
  return total;
}

async function deleteStorageFolder(
  bucket: Bucket,
  prefix: string,
  dryRun: boolean,
): Promise<number> {
  const [files] = await bucket.getFiles({ prefix });
  if (!dryRun) await Promise.all(files.map((f) => f.delete()));
  return files.length;
}

/** Deletes Auth first, then the Firestore doc — the reverse order silently
 * un-deletes the doc if the account still has a live session mid-run, see
 * FirebaseAuthGuard.loadOrCreateUserAndBackfillClaim. */
async function deleteUsersExcept(
  auth: Auth,
  firestore: Firestore,
  preservedEmail: string,
  dryRun: boolean,
): Promise<{ kept: string; deleted: string[] }> {
  const deleted: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.email === preservedEmail) continue;
      deleted.push(user.email ?? user.uid);
      if (!dryRun) {
        await auth.deleteUser(user.uid);
        await firestore.collection(Collections.USERS).doc(user.uid).delete();
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { kept: preservedEmail, deleted };
}

async function run() {
  const dryRun = !process.argv.includes('--confirm');
  const includeProducts = process.argv.includes('--include-products');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const firestore = app.get<Firestore>(FIRESTORE);
  const bucket = app.get<Bucket>(FIREBASE_STORAGE_BUCKET);
  const auth = app.get<Auth>(FIREBASE_AUTH);

  logger.log(
    dryRun
      ? 'DRY RUN — nothing will be deleted. Pass --confirm to actually purge.'
      : 'CONFIRMED — deleting for real.',
  );

  for (const { parent, sub } of SUBCOLLECTIONS) {
    const count = await deleteSubcollections(firestore, parent, sub, dryRun);
    logger.log(`${parent}/*/${sub}: ${count} doc(s)${dryRun ? ' would be deleted' : ' deleted'}`);
  }

  for (const collection of TRANSACTIONAL_COLLECTIONS) {
    const count = await deleteCollection(firestore, collection, dryRun);
    logger.log(`${collection}: ${count} doc(s)${dryRun ? ' would be deleted' : ' deleted'}`);
  }

  if (includeProducts) {
    const stockLevelCount = await deleteSubcollections(
      firestore,
      Collections.PRODUCTS,
      Collections.STOCK_LEVELS,
      dryRun,
    );
    logger.log(
      `products/*/${Collections.STOCK_LEVELS}: ${stockLevelCount} doc(s)${dryRun ? ' would be deleted' : ' deleted'}`,
    );
    const productCount = await deleteCollection(firestore, Collections.PRODUCTS, dryRun);
    logger.log(
      `${Collections.PRODUCTS}: ${productCount} doc(s)${dryRun ? ' would be deleted' : ' deleted'}`,
    );
  }

  const proofCount = await deleteStorageFolder(bucket, 'payment-proofs/', dryRun);
  logger.log(
    `Storage payment-proofs/: ${proofCount} file(s)${dryRun ? ' would be deleted' : ' deleted'}`,
  );

  const { kept, deleted } = await deleteUsersExcept(auth, firestore, PRESERVED_ADMIN_EMAIL, dryRun);
  logger.log(
    `users: ${deleted.length} account(s)${dryRun ? ' would be deleted' : ' deleted'} (${deleted.join(', ') || 'none'}) — kept: ${kept}`,
  );

  logger.log(
    `Left untouched: ${includeProducts ? '' : 'products, '}categories, warehouses, suppliers, ` +
      'paymentMethods, shippingRates, discountCodes, and Storage products/*.',
  );

  await app.close();
  process.exit(0);
}

run().catch((error) => {
  logger.error('Reset failed', error);
  process.exit(1);
});
