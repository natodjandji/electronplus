import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum SyncDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum SyncStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface SyncLog extends FirestoreDoc {
  direction: SyncDirection;
  status: SyncStatus;
  startedAt: Date;
  finishedAt?: Date;
  itemsProcessed: number;
  reference?: string; // e.g. orderId for outbound sync
  error?: string;
  /** Firestore TTL policy field (see firestore.indexes.json /
   * `gcloud firestore fields ttls update`) — one run every
   * PROFIT_PLUS_SYNC_CRON tick (default 15min) writes a doc forever, so
   * without this the collection grows unbounded. 30 days is plenty for
   * debugging a sync issue; getLogs() only ever shows the latest 50. */
  expiresAt: Date;
}

const SYNC_LOG_RETENTION_DAYS = 30;

export function syncLogExpiresAt(): Date {
  return new Date(Date.now() + SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
