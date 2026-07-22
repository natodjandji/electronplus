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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayPalClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let PayPalClient = class PayPalClient {
    constructor(config) {
        this.config = config;
    }
    get baseUrl() {
        return this.config.get('PAYPAL_ENV', { infer: true }) === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }
    assertConfigured() {
        const clientId = this.config.get('PAYPAL_CLIENT_ID', { infer: true });
        const secret = this.config.get('PAYPAL_CLIENT_SECRET', { infer: true });
        if (!clientId || !secret) {
            throw new common_1.ServiceUnavailableException('PayPal is not configured (missing PAYPAL_CLIENT_ID/SECRET)');
        }
        return { clientId, secret };
    }
    async getAccessToken() {
        if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
            return this.cachedToken.token;
        }
        const { clientId, secret } = this.assertConfigured();
        const basicAuth = Buffer.from(`${clientId}:${secret}`).toString('base64');
        const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });
        if (!res.ok) {
            throw new common_1.ServiceUnavailableException(`PayPal auth failed: ${res.status} ${await res.text()}`);
        }
        const data = (await res.json());
        this.cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
        return data.access_token;
    }
    async createOrder(amount, currency = 'USD') {
        const token = await this.getAccessToken();
        const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{ amount: { currency_code: currency, value: amount.toFixed(2) } }],
            }),
        });
        if (!res.ok) {
            throw new common_1.ServiceUnavailableException(`PayPal create order failed: ${res.status} ${await res.text()}`);
        }
        return res.json();
    }
    async captureOrder(paypalOrderId) {
        const token = await this.getAccessToken();
        const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const raw = await res.json();
        if (!res.ok) {
            throw new common_1.ServiceUnavailableException(`PayPal capture failed: ${res.status} ${JSON.stringify(raw)}`);
        }
        return { status: raw.status, raw };
    }
};
exports.PayPalClient = PayPalClient;
exports.PayPalClient = PayPalClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PayPalClient);
//# sourceMappingURL=paypal.client.js.map