import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';

interface PayPalAccessToken {
  access_token: string;
  expires_in: number;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links: { rel: string; href: string; method: string }[];
}

@Injectable()
export class PayPalClient {
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get baseUrl(): string {
    return this.config.get('PAYPAL_ENV', { infer: true }) === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private assertConfigured() {
    const clientId = this.config.get('PAYPAL_CLIENT_ID', { infer: true });
    const secret = this.config.get('PAYPAL_CLIENT_SECRET', { infer: true });
    if (!clientId || !secret) {
      throw new ServiceUnavailableException(
        'PayPal is not configured (missing PAYPAL_CLIENT_ID/SECRET)',
      );
    }
    return { clientId, secret };
  }

  private async getAccessToken(): Promise<string> {
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
      throw new ServiceUnavailableException(
        `PayPal auth failed: ${res.status} ${await res.text()}`,
      );
    }
    const data = (await res.json()) as PayPalAccessToken;
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }

  async createOrder(amount: number, currency = 'USD'): Promise<PayPalOrder> {
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
      throw new ServiceUnavailableException(
        `PayPal create order failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<PayPalOrder>;
  }

  async captureOrder(paypalOrderId: string): Promise<{ status: string; raw: unknown }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const raw = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `PayPal capture failed: ${res.status} ${JSON.stringify(raw)}`,
      );
    }
    return { status: (raw as { status: string }).status, raw };
  }
}
