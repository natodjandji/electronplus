import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum SecondStoreSyncStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
}

/** One run of the secundaria store's own Profit Plus sync — deliberately
 * its own collection, not shared with the principal store's SyncLog
 * (erp-sync/entities/sync-log.entity.ts): the two are unrelated ERP
 * installs and this one only ever runs inbound (no sales-export/outbound
 * direction exists for the secundaria bridge). */
export interface SecondStoreSyncLog extends FirestoreDoc {
  status: SecondStoreSyncStatus;
  startedAt: Date;
  finishedAt?: Date;
  itemsProcessed: number;
  error?: string;
  /** Firestore TTL policy field, same 30-day retention as the principal
   * store's syncLogs — see firebase console / gcloud firestore fields ttls. */
  expiresAt: Date;
}

const SYNC_LOG_RETENTION_DAYS = 30;

export function secondStoreSyncLogExpiresAt(): Date {
  return new Date(Date.now() + SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
