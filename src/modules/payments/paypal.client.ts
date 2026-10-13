import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

/** An order after capture: its own status and the charge itself. An order
 * can be COMPLETED while its capture is still PENDING (PayPal reviewing the
 * payment), so the capture is what says the money arrived. */
export interface PayPalCaptureResult {
  status: string;
  capture?: { id: string; status: string; amount: number; currency: string };
}

/** Per call. A hung PayPal request otherwise holds the buyer's checkout
 * (and a Cloud Run request) open until the platform cuts it off. */
const PAYPAL_TIMEOUT_MS = 20_000;

interface PayPalOrderBody {
  status?: string;
  details?: { issue?: string }[];
  purchase_units?: {
    payments?: {
      captures?: {
        id?: string;
        status?: string;
        amount?: { value?: string; currency_code?: string };
      }[];
    };
  }[];
}

function toCaptureResult(body: PayPalOrderBody): PayPalCaptureResult {
  const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: body.status ?? 'UNKNOWN',
    capture: capture && {
      id: capture.id ?? '',
      status: capture.status ?? 'UNKNOWN',
      amount: Number(capture.amount?.value),
      currency: capture.amount?.currency_code ?? '',
    },
  };
}

@Injectable()
export class PayPalClient {
  private readonly logger = new Logger(PayPalClient.name);
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
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      // PayPal's raw error body is logged server-side only — it's third-party
      // internal detail, not something to hand back to the caller verbatim.
      this.logger.error(`PayPal auth failed: ${res.status} ${await res.text()}`);
      throw new ServiceUnavailableException('PayPal authentication failed');
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
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.error(`PayPal create order failed: ${res.status} ${await res.text()}`);
      throw new ServiceUnavailableException('PayPal order creation failed');
    }
    return res.json() as Promise<PayPalOrder>;
  }

  async captureOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
      },
    );
    const body = (await res.json().catch(() => ({}))) as PayPalOrderBody;
    if (!res.ok) {
      // A capture that went through but whose answer was lost (a timeout,
      // a dropped connection) comes back as ORDER_ALREADY_CAPTURED on the
      // buyer's retry: read the order instead, or the payment stays pending
      // with the money already taken.
      if (res.status === 422 && body.details?.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
        return this.getOrder(paypalOrderId);
      }
      this.logger.error(`PayPal capture failed: ${res.status} ${JSON.stringify(body)}`);
      throw new ServiceUnavailableException('PayPal capture failed');
    }
    return toCaptureResult(body);
  }

  private async getOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
      },
    );
    const body = (await res.json().catch(() => ({}))) as PayPalOrderBody;
    if (!res.ok) {
      this.logger.error(`PayPal order lookup failed: ${res.status} ${JSON.stringify(body)}`);
      throw new ServiceUnavailableException('PayPal order lookup failed');
    }
    return toCaptureResult(body);
  }
}
