export const PROFIT_PLUS_ADAPTER = 'PROFIT_PLUS_ADAPTER';

export interface ErpInventoryItem {
  externalId: string;
  sku: string;
  name: string;
  categoryCode: string;
  categoryLabel: string;
  retailPrice: number;
  wholesalePrice: number;
  cost?: number;
  stock: number;
  specs?: string;
}

export interface ErpSaleExportItem {
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface ErpSaleExport {
  orderId: string;
  customerTaxId?: string;
  items: ErpSaleExportItem[];
  total: number;
  soldAt: Date;
}

/**
 * Port for the Profit Plus ERP integration. The real access mechanism (direct
 * DB connection vs. a REST/SOAP middleware) is not decided yet, so business
 * logic depends only on this interface — swap the DI provider in
 * erp-sync.module.ts once the mechanism is known, nothing else changes.
 */
export interface ProfitPlusAdapter {
  fetchInventory(): Promise<ErpInventoryItem[]>;
  reportSale(sale: ErpSaleExport): Promise<void>;
  healthCheck(): Promise<boolean>;
}
