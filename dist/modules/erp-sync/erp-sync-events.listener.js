"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErpSyncEventsListener = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const bullmq_2 = require("bullmq");
const orders_service_1 = require("../orders/orders.service");
const erp_export_processor_1 = require("./erp-export.processor");
let ErpSyncEventsListener = class ErpSyncEventsListener {
    constructor(exportQueue) {
        this.exportQueue = exportQueue;
    }
    async handleOrderPaid(payload) {
        await this.exportQueue.add('report-sale', { orderId: payload.orderId }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
    }
};
exports.ErpSyncEventsListener = ErpSyncEventsListener;
__decorate([
    (0, event_emitter_1.OnEvent)(orders_service_1.ORDER_PAID_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ErpSyncEventsListener.prototype, "handleOrderPaid", null);
exports.ErpSyncEventsListener = ErpSyncEventsListener = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(erp_export_processor_1.ERP_EXPORT_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], ErpSyncEventsListener);
//# sourceMappingURL=erp-sync-events.listener.js.map