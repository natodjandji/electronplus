import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** Firestore doc at salesDailySummaries/{YYYY-MM-DD} — nightly rollup so the dashboard's sales/purchases series reads a small collection instead of scanning orders. */
export interface SalesDailySummary extends FirestoreDoc {
  date: string;
  salesTotal: number;
  purchasesTotal: number;
  ordersCount: number;
}
