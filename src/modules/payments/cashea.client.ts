import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';
import type { CasheaCheckoutPayload } from './cashea-payload';

/** Per call: a hung Cashea request otherwise holds the buyer's checkout
 * (and a Cloud Run request) open until the platform cuts it off. */
const CASHEA_TIMEOUT_MS = 20_000;
/** Cashea's minimum purchase changes rarely; checkout reads it often. */
const CONFIG_CACHE_MS = 10 * 60 * 1000;

/** Cashea refused a call; `message` is meant for the admin or the buyer. */
export class CasheaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Whether Cashea's credentials are all set — the payment method is only
 * offered then. */
export function casheaConfigured(config: ConfigService<EnvConfig, true>): boolean {
  return Boolean(
    config.get('CASHEA_PUBLIC_KEY', { infer: true }) &&
    config.get('CASHEA_PRIVATE_KEY', { infer: true }) &&
    config.get('CASHEA_EXTERNAL_CLIENT_ID', { infer: true }) &&
    config.get('CASHEA_STORE_ID', { infer: true }),
  );
}

/**
 * Cashea's web checkout, as its official SDK (cashea-web-checkout-sdk)
 * does it, but from the server: the checkout is created here from the
 * stored order, so its lines and prices can't be edited in the browser.
 * The public key creates checkouts and reads the minimum purchase; the
 * private key confirms a down payment or cancels an order and never
 * leaves the server.
 */
@Injectable()
export class CasheaClient {
  private readonly logger = new Logger(CasheaClient.name);
  private cachedConfig?: { minAmount: number | null; at: number };

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  isConfigured(): boolean {
    return casheaConfigured(this.config);
  }

  /** Cashea's minimum purchase in dollars; null when it can't be read
   * right now (checkout then lets Cashea itself decide). */
  async minAmount(): Promise<number | null> {
    const cached = this.cachedConfig;
    if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return cached.minAmount;
    try {
      const body = await this.call<{ minAmount?: number | string }>(
        'GET',
        '/config/web-checkout',
        'public',
      );
      const minAmount = Number(body?.minAmount);
      const value = Number.isFinite(minAmount) && minAmount >= 0 ? minAmount : null;
      this.cachedConfig = { minAmount: value, at: Date.now() };
      return value;
    } catch (error) {
      this.logger.warn(`Cashea config unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  /** Creates the checkout the buyer completes on Cashea's site. */
  async createCheckout(
    payload: CasheaCheckoutPayload,
  ): Promise<{ payloadId: number; checkoutUrl: string }> {
    const body = await this.call<number | { id?: number }>(
      'POST',
      '/web-checkout/payload',
      'public',
      payload,
    );
    const payloadId = typeof body === 'number' ? body : Number(body?.id);
    if (!Number.isInteger(payloadId) || payloadId <= 0) {
      throw new CasheaError(502, 'Cashea no devolvió la orden creada.');
    }
    const base = this.config.get('CASHEA_CHECKOUT_URL', { infer: true }).replace(/\/+$/, '');
    return {
      payloadId,
      checkoutUrl: `${base}/checkout?order-payload-id=${encodeURIComponent(payloadId)}`,
    };
  }

  /** The store received the buyer's down payment: Cashea finances the rest. */
  async confirmDownPayment(casheaOrderId: string, amount: number): Promise<void> {
    await this.call(
      'POST',
      `/orders/${encodeURIComponent(casheaOrderId)}/down-payment`,
      'private',
      {
        amount,
      },
    );
  }

  async cancelOrder(casheaOrderId: string): Promise<void> {
    await this.call('DELETE', `/orders/${encodeURIComponent(casheaOrderId)}`, 'private');
  }

  private async call<T>(
    method: string,
    path: string,
    key: 'public' | 'private',
    body?: unknown,
  ): Promise<T> {
    const apiKey = this.config.get(key === 'public' ? 'CASHEA_PUBLIC_KEY' : 'CASHEA_PRIVATE_KEY', {
      infer: true,
    });
    if (!apiKey) throw new CasheaError(503, 'Cashea no está configurado.');
    const base = this.config.get('CASHEA_API_URL', { infer: true }).replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `ApiKey ${apiKey}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CASHEA_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CasheaError(503, `No se pudo conectar con Cashea: ${(error as Error).message}`);
    }
    const text = await res.text();
    if (!res.ok) throw new CasheaError(res.status, describeError(res.status, text));
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}

/** Cashea's error body as one line for the panel. */
export function describeError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string | string[]; error?: string };
    const message = Array.isArray(parsed.message) ? parsed.message.join(' · ') : parsed.message;
    return (message ?? parsed.error ?? `Cashea respondió ${status}`).slice(0, 300);
  } catch {
    return `Cashea respondió ${status}`;
  }
}
