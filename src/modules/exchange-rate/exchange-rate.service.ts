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
/** The rate feeds prices in Bs on the site and in quote PDFs: a slow
 * upstream must not hold those requests open. */
const FETCH_TIMEOUT_MS = 8_000;

interface DolarApiResponse {
  promedio?: number;
  fechaActualizacion?: string;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private cached?: BcvRate;
  private cachedAt = 0;
  /** One upstream call at a time: when the cache expires, every request
   * waiting for the rate shares it instead of each fetching its own. */
  private inFlight?: Promise<BcvRate>;

  async getBcvRate(): Promise<BcvRate> {
    if (this.cached && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<BcvRate> {
    try {
      const res = await fetch(BCV_RATE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`BCV rate source responded ${res.status}`);
      const data = (await res.json()) as DolarApiResponse;
      // A zero, negative or non-numeric rate would price everything at 0 Bs.
      if (
        typeof data.promedio !== 'number' ||
        !Number.isFinite(data.promedio) ||
        data.promedio <= 0
      ) {
        throw new Error('Unexpected BCV rate payload shape');
      }

      this.cached = {
        rate: data.promedio,
        date: data.fechaActualizacion ?? new Date().toISOString(),
        source: 'BCV',
      };
      this.cachedAt = Date.now();
      return this.cached;
    } catch (error) {
      this.logger.warn(`Failed to fetch BCV rate: ${(error as Error).message}`);
      if (this.cached) return this.cached;
      throw error;
    }
  }
}
