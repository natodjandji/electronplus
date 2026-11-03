import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum StockAlertLevel {
  LOW = 'low',
  OUT = 'out',
}

export interface StockAlert extends FirestoreDoc {
  productId: string;
  /** The barcode. */
  sku: string;
  /** The store's SKU, the code alerts show. */
  model?: string | null;
  name: string;
  level: StockAlertLevel;
  stockAtTrigger: number;
  threshold: number;
  active: boolean;
  resolvedAt?: Date;
}
