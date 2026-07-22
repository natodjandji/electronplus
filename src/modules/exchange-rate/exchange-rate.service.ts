import { Injectable, Logger } from '@nestjs/common';

export interface BcvRate {
  rate: number;
  date: string;
  source: string;
}

const BCV_RATE_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
// BCV publishes at most once per business day — an hour of staleness is fine
// and keeps us from hammering the upstream API on every page view.
const CACHE_TTL_MS = 60 * 60 * 1000;

interface DolarApiResponse {
  promedio?: number;
  fechaActualizacion?: string;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private cached?: BcvRate;
  private cachedAt = 0;

  async getBcvRate(): Promise<BcvRate> {
    const now = Date.now();
    if (this.cached && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }

    try {
      const res = await fetch(BCV_RATE_URL);
      if (!res.ok) throw new Error(`BCV rate source responded ${res.status}`);
      const data = (await res.json()) as DolarApiResponse;
      if (typeof data.promedio !== 'number') {
        throw new Error('Unexpected BCV rate payload shape');
      }

      this.cached = {
        rate: data.promedio,
        date: data.fechaActualizacion ?? new Date().toISOString(),
        source: 'BCV',
      };
      this.cachedAt = now;
      return this.cached;
    } catch (error) {
      this.logger.warn(`Failed to fetch BCV rate: ${(error as Error).message}`);
      if (this.cached) return this.cached;
      throw error;
    }
  }
}
