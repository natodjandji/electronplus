import { FirestoreDoc } from '../../../firebase/firestore.repository';

export enum StockAlertLevel {
  LOW = 'low',
  OUT = 'out',
}

export interface StockAlert extends FirestoreDoc {
  productId: string;
  sku: string;
  name: string;
  level: StockAlertLevel;
  stockAtTrigger: number;
  threshold: number;
  active: boolean;
  resolvedAt?: Date;
}
