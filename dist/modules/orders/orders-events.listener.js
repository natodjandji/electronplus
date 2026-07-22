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
var OrdersEventsListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersEventsListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const payments_service_1 = require("../payments/payments.service");
const orders_service_1 = require("./orders.service");
let OrdersEventsListener = OrdersEventsListener_1 = class OrdersEventsListener {
    constructor(ordersService) {
        this.ordersService = ordersService;
        this.logger = new common_1.Logger(OrdersEventsListener_1.name);
    }
    async handlePaymentVerified(payload) {
        try {
            await this.ordersService.markPaid(payload.orderId);
        }
        catch (error) {
            this.logger.error(`Failed to mark order ${payload.orderId} as paid`, error);
        }
    }
};
exports.OrdersEventsListener = OrdersEventsListener;
__decorate([
    (0, event_emitter_1.OnEvent)(payments_service_1.PAYMENT_VERIFIED_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrdersEventsListener.prototype, "handlePaymentVerified", null);
exports.OrdersEventsListener = OrdersEventsListener = OrdersEventsListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService])
], OrdersEventsListener);
//# sourceMappingURL=orders-events.listener.js.map