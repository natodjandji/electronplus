export const Collections = {
  USERS: 'users',
  CATEGORIES: 'categories',
  WAREHOUSES: 'warehouses',
  PRODUCTS: 'products',
  STOCK_LEVELS: 'stockLevels', // subcollection of products/{id}
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
} as const;
