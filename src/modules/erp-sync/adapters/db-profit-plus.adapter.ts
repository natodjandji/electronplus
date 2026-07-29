import { Injectable } from '@nestjs/common';
import {
  ErpInventoryItem,
  ErpSaleExport,
  ProfitPlusAdapter,
} from './profit-plus-adapter.interface';

/**
 * Stub for a direct-DB integration (Firebird/SQL Server) with Profit Plus.
 * Wire up a connection using PROFIT_PLUS_DB_URL once the schema/credentials
 * are confirmed with the client — the rest of the app only depends on the
 * ProfitPlusAdapter interface, so no other code needs to change.
 */
@Injectable()
export class DbProfitPlusAdapter implements ProfitPlusAdapter {
  fetchInventory(): Promise<ErpInventoryItem[]> {
    throw new Error(
      'DbProfitPlusAdapter is not implemented yet — configure Profit Plus DB access first.',
    );
  }

  reportSale(_sale: ErpSaleExport): Promise<void> {
    throw new Error(
      'DbProfitPlusAdapter is not implemented yet — configure Profit Plus DB access first.',
    );
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}
