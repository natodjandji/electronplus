import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { AppModule } from '../../app.module';
import { FIREBASE_STORAGE_BUCKET, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';

const logger = new Logger('ResetDatabase');

/**
 * Wipes every transactional/operational collection — quotes, orders,
 * payments, purchase orders + their payment subcollections, suppliers'
 * payables, notifications, stock alerts, sync logs, daily sales summaries,
 * second-store items, expenses — plus the payment-proof and (optionally)
 * product-image Storage folders. Run once, deliberately, right before a
 * store goes live for real, NOT as a routine dev-cleanup command.
 *
 * Deliberately NEVER touches:
 *   - users (Firebase Auth is the source of truth; deleting the Firestore
 *     doc without also deleting the Auth account just gets it silently
 *     recreated on the user's next request — see FirebaseAuthGuard
 *     .loadOrCreateUserAndBackfillClaim). Remove real people through
 *     Firebase Auth directly if that's actually the intent.
 *   - products / categories / warehouses / suppliers / paymentMethods /
 *     shippingRates / discountCodes — this is catalog/config structure,
 *     not "test data"; wiping it would take the storefront down. If any
 *     of these genuinely hold placeholder rows, remove those specific
 *     documents by hand from the Firebase console instead of scripting it.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/reset-database.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/reset-database.ts --confirm
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

async function run() {
  const dryRun = !process.argv.includes('--confirm');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const firestore = app.get<Firestore>(FIRESTORE);
  const bucket = app.get<Bucket>(FIREBASE_STORAGE_BUCKET);

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

  const proofCount = await deleteStorageFolder(bucket, 'payment-proofs/', dryRun);
  logger.log(
    `Storage payment-proofs/: ${proofCount} file(s)${dryRun ? ' would be deleted' : ' deleted'}`,
  );

  logger.log(
    'Left untouched: users, products, categories, warehouses, suppliers, ' +
      'paymentMethods, shippingRates, discountCodes, and Storage products/*.',
  );

  await app.close();
  process.exit(0);
}

run().catch((error) => {
  logger.error('Reset failed', error);
  process.exit(1);
});
