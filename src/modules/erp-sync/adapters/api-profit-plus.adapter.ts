import { Injectable } from '@nestjs/common';
import {
  ErpInventoryItem,
  ErpSaleExport,
  ProfitPlusAdapter,
} from './profit-plus-adapter.interface';

/**
 * Stub for a REST/SOAP middleware in front of Profit Plus. Point it at
 * PROFIT_PLUS_API_URL / PROFIT_PLUS_API_KEY once that middleware exists —
 * the rest of the app only depends on the ProfitPlusAdapter interface, so
 * no other code needs to change.
 */
@Injectable()
export class ApiProfitPlusAdapter implements ProfitPlusAdapter {
  fetchInventory(): Promise<ErpInventoryItem[]> {
    throw new Error(
      'ApiProfitPlusAdapter is not implemented yet — configure the Profit Plus API endpoint first.',
    );
  }

  reportSale(_sale: ErpSaleExport): Promise<void> {
    throw new Error(
      'ApiProfitPlusAdapter is not implemented yet — configure the Profit Plus API endpoint first.',
    );
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}
