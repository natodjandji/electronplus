"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MockProfitPlusAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProfitPlusAdapter = void 0;
const common_1 = require("@nestjs/common");
let MockProfitPlusAdapter = MockProfitPlusAdapter_1 = class MockProfitPlusAdapter {
    constructor() {
        this.logger = new common_1.Logger(MockProfitPlusAdapter_1.name);
        this.inventory = [
            { externalId: 'PP-0001', sku: 'EP-LED-9W', name: 'Bombillo LED 9W E27 luz fría', categoryCode: 'iluminacion', categoryLabel: 'Iluminación', retailPrice: 4.5, wholesalePrice: 3.2, cost: 2.1, stock: 320, specs: '9W · 220V · 6500K · 900lm · Base E27' },
            { externalId: 'PP-0002', sku: 'EP-CBL-12AWG', name: 'Cable THHN 12 AWG (rollo 100m)', categoryCode: 'cables', categoryLabel: 'Cables', retailPrice: 68, wholesalePrice: 55, cost: 42, stock: 12, specs: 'Cobre 100% · 600V · Aislamiento THHN/THWN' },
            { externalId: 'PP-0003', sku: 'EP-BRK-2P32', name: 'Breaker enchufable 2P 32A', categoryCode: 'proteccion', categoryLabel: 'Protección', retailPrice: 14.9, wholesalePrice: 11.4, cost: 8.2, stock: 4, specs: 'Bipolar · 32A · 10kA · Curva C' },
            { externalId: 'PP-0004', sku: 'EP-PNL-8C', name: 'Tablero eléctrico 8 circuitos', categoryCode: 'tableros', categoryLabel: 'Tableros', retailPrice: 42, wholesalePrice: 34, cost: 26, stock: 0, specs: '8 espacios · Empotrable · Barra neutro/tierra' },
            { externalId: 'PP-0005', sku: 'EP-TC-DPL', name: 'Toma doble polarizada con tierra', categoryCode: 'tomas', categoryLabel: 'Tomas e interruptores', retailPrice: 3.1, wholesalePrice: 2.25, cost: 1.4, stock: 540, specs: '15A · 125V · Placa blanca' },
            { externalId: 'PP-0006', sku: 'EP-LED-PNL-24W', name: 'Panel LED plafón 24W redondo', categoryCode: 'iluminacion', categoryLabel: 'Iluminación', retailPrice: 12.5, wholesalePrice: 9.6, cost: 6.8, stock: 78, specs: '24W · 4000K · 2000lm · Empotrable Ø225mm' },
            { externalId: 'PP-0007', sku: 'EP-CBL-10AWG', name: 'Cable THHN 10 AWG (rollo 100m)', categoryCode: 'cables', categoryLabel: 'Cables', retailPrice: 92, wholesalePrice: 76, cost: 58, stock: 6, specs: 'Cobre 100% · 600V · Aislamiento THHN' },
            { externalId: 'PP-0008', sku: 'EP-INT-1V', name: 'Interruptor 1 vía blanco', categoryCode: 'tomas', categoryLabel: 'Tomas e interruptores', retailPrice: 2.4, wholesalePrice: 1.8, cost: 1.1, stock: 420, specs: '10A · 250V · Instalación empotrada' },
        ];
    }
    async fetchInventory() {
        await delay(150);
        return this.inventory.map((item) => ({ ...item }));
    }
    async reportSale(sale) {
        await delay(100);
        this.logger.log(`[mock] reported sale for order ${sale.orderId}: ${sale.items.length} line(s), total ${sale.total}`);
    }
    async healthCheck() {
        return true;
    }
};
exports.MockProfitPlusAdapter = MockProfitPlusAdapter;
exports.MockProfitPlusAdapter = MockProfitPlusAdapter = MockProfitPlusAdapter_1 = __decorate([
    (0, common_1.Injectable)()
], MockProfitPlusAdapter);
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=mock-profit-plus.adapter.js.map