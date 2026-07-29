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
}
