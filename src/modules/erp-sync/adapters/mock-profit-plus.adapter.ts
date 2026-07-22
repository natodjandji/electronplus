import { Injectable, Logger } from '@nestjs/common';
import { ErpInventoryItem, ErpSaleExport, ProfitPlusAdapter } from './profit-plus-adapter.interface';

/**
 * Seeded with the same catalog the Electron Plus frontend ships as mock
 * data, so the whole stack (pricing, catalog, stock alerts, sale export)
 * is exercisable end to end before the real Profit Plus access mechanism
 * is decided.
 */
@Injectable()
export class MockProfitPlusAdapter implements ProfitPlusAdapter {
  private readonly logger = new Logger(MockProfitPlusAdapter.name);

  private readonly inventory: ErpInventoryItem[] = [
    { externalId: 'PP-0001', sku: 'EP-LED-9W', name: 'Bombillo LED 9W E27 luz fría', categoryCode: 'iluminacion', categoryLabel: 'Iluminación', retailPrice: 4.5, wholesalePrice: 3.2, cost: 2.1, stock: 320, specs: '9W · 220V · 6500K · 900lm · Base E27' },
    { externalId: 'PP-0002', sku: 'EP-CBL-12AWG', name: 'Cable THHN 12 AWG (rollo 100m)', categoryCode: 'cables', categoryLabel: 'Cables', retailPrice: 68, wholesalePrice: 55, cost: 42, stock: 12, specs: 'Cobre 100% · 600V · Aislamiento THHN/THWN' },
    { externalId: 'PP-0003', sku: 'EP-BRK-2P32', name: 'Breaker enchufable 2P 32A', categoryCode: 'proteccion', categoryLabel: 'Protección', retailPrice: 14.9, wholesalePrice: 11.4, cost: 8.2, stock: 4, specs: 'Bipolar · 32A · 10kA · Curva C' },
    { externalId: 'PP-0004', sku: 'EP-PNL-8C', name: 'Tablero eléctrico 8 circuitos', categoryCode: 'tableros', categoryLabel: 'Tableros', retailPrice: 42, wholesalePrice: 34, cost: 26, stock: 0, specs: '8 espacios · Empotrable · Barra neutro/tierra' },
    { externalId: 'PP-0005', sku: 'EP-TC-DPL', name: 'Toma doble polarizada con tierra', categoryCode: 'tomas', categoryLabel: 'Tomas e interruptores', retailPrice: 3.1, wholesalePrice: 2.25, cost: 1.4, stock: 540, specs: '15A · 125V · Placa blanca' },
    { externalId: 'PP-0006', sku: 'EP-LED-PNL-24W', name: 'Panel LED plafón 24W redondo', categoryCode: 'iluminacion', categoryLabel: 'Iluminación', retailPrice: 12.5, wholesalePrice: 9.6, cost: 6.8, stock: 78, specs: '24W · 4000K · 2000lm · Empotrable Ø225mm' },
    { externalId: 'PP-0007', sku: 'EP-CBL-10AWG', name: 'Cable THHN 10 AWG (rollo 100m)', categoryCode: 'cables', categoryLabel: 'Cables', retailPrice: 92, wholesalePrice: 76, cost: 58, stock: 6, specs: 'Cobre 100% · 600V · Aislamiento THHN' },
    { externalId: 'PP-0008', sku: 'EP-INT-1V', name: 'Interruptor 1 vía blanco', categoryCode: 'tomas', categoryLabel: 'Tomas e interruptores', retailPrice: 2.4, wholesalePrice: 1.8, cost: 1.1, stock: 420, specs: '10A · 250V · Instalación empotrada' },
  ];

  async fetchInventory(): Promise<ErpInventoryItem[]> {
    await delay(150);
    return this.inventory.map((item) => ({ ...item }));
  }

  async reportSale(sale: ErpSaleExport): Promise<void> {
    await delay(100);
    this.logger.log(`[mock] reported sale for order ${sale.orderId}: ${sale.items.length} line(s), total ${sale.total}`);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
