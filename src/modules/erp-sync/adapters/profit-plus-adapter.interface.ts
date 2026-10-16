export const PROFIT_PLUS_ADAPTER = 'PROFIT_PLUS_ADAPTER';

/** The adapter has no bridge/connection configured yet — an expected state
 * before go-live, so sync callers log it instead of alerting on it. */
export class ErpNotConfiguredError extends Error {}

export interface ErpInventoryItem {
  externalId: string;
  sku: string;
  name: string;
  categoryCode: string;
  categoryLabel: string;
  /** The category's own code in Profit Plus, when the bridge sends it — what
   * keeps a renamed category the same category on the web. */
  categoryExternalId?: string;
  /** The product's brand, when Profit Plus has one for it. */
  brand?: string;
  /** The brand's own code in Profit Plus — what keeps a renamed brand
   * linked to the same supplier on the web. */
  brandExternalId?: string;
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
  /** False until the connection details exist — scheduled runs skip quietly
   * instead of logging a failed sync every tick before go-live. */
  isConfigured(): boolean;
  /** False while the bridge can only read: paid sales then stay pending
   * (not marked as reported) until it can write them into Profit Plus. */
  canReportSales(): boolean;
  fetchInventory(): Promise<ErpInventoryItem[]>;
  reportSale(sale: ErpSaleExport): Promise<void>;
  healthCheck(): Promise<boolean>;
}
