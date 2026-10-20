export const Collections = {
  USERS: 'users',
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  QUOTES: 'quotes',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  SYNC_LOGS: 'syncLogs',
  STOCK_ALERTS: 'stockAlerts',
  SUPPLIERS: 'suppliers',
  SUPPLIERS_PAYABLES: 'suppliers_payables',
  SUPPLIER_PAYMENTS: 'supplierPayments', // subcollection of suppliers_payables/{id}
  PURCHASE_ORDERS: 'purchase_orders',
  PURCHASE_ORDER_PAYMENTS: 'purchaseOrderPayments', // subcollection of purchase_orders/{id}
  NOTIFICATIONS: 'notifications',
  SALES_DAILY_SUMMARIES: 'salesDailySummaries',
  PAYMENT_METHODS: 'paymentMethods',
  SHIPPING_RATES: 'shippingRates',
  DISCOUNT_CODES: 'discountCodes',
  SECOND_STORE_PRODUCTS: 'secondStoreProducts',
  SECOND_STORE_SYNC_LOGS: 'secondStoreSyncLogs',
  EXPENSES: 'expenses',
  /** Carts sellers build for in-store customers (see SalesCartsService). */
  SALES_CARTS: 'salesCarts',
  /** Frozen copies of shared sales carts, keyed by their public link token. */
  SHARED_QUOTES: 'sharedQuotes',
  /** Sequential numbers (e.g. quote numbers), one doc per sequence. */
  COUNTERS: 'counters',
  /** Customer reviews left through the store's QR (see ReviewsService). */
  REVIEWS: 'reviews',
  /** App settings an admin edits, one doc per feature (e.g. "reviews"). */
  SETTINGS: 'settings',
  /** Server-only read indexes (see CollectionSnapshot) — no client rule
   * grants access, so firestore.rules' default deny covers them. */
  SNAPSHOTS: 'snapshots',
} as const;
