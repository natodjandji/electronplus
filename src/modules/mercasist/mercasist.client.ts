import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';
import { MercasistPage } from './mercasist.types';

/** Per call: a hung request otherwise holds a sync run (and its Cloud Run
 * request) open until the platform cuts it off. */
const TIMEOUT_MS = 20_000;
/** A 429 asking to wait this long or less is waited out here; a longer
 * one ends the run, and the next scheduled one carries on. */
const MAX_WAIT_S = 20;
const MAX_RETRIES = 2;
/** A safety stop for paging: 400 pages of 25 is 10,000 publications. */
const MAX_PAGES = 400;

/** Mercasist refused a call; `message` is meant for the admin. */
export class MercasistError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MercasistQuota {
  /** Requests left today (the day restarts at midnight, Venezuela time). */
  remainingDay?: number;
  limitDay?: number;
  at: string;
}

/**
 * Mercasist's REST API with the account's token (Mercasist → user menu →
 * Token de API). One token per account and it never expires, so it is a
 * secret: Secret Manager in production, never in the browser.
 *
 * Mercasist caps each account at 300 requests a minute, 10,000 a day and
 * 60 publication edits a minute; this client reads the quota headers it
 * sends back and waits out short 429s.
 */
@Injectable()
export class MercasistClient {
  private readonly logger = new Logger(MercasistClient.name);
  private lastQuota?: MercasistQuota;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('MERCASIST_API_TOKEN', { infer: true }));
  }

  /** As of the last answer this instance got. */
  quota(): MercasistQuota | undefined {
    return this.lastQuota;
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', withQuery(path, query));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /** Every item of a paged listing, one page after another (Mercasist asks
   * for that instead of parallel pages). */
  async listAll<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    pageSize: number,
  ): Promise<T[]> {
    const items: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.get<MercasistPage<T>>(path, {
        ...query,
        limit: pageSize,
        offset: page * pageSize,
      });
      const data = Array.isArray(body?.data) ? body.data : [];
      items.push(...data);
      if (!body?.pagination?.has_more || data.length === 0) return items;
    }
    this.logger.warn(`${path}: stopped after ${MAX_PAGES} pages`);
    return items;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.config.get('MERCASIST_API_TOKEN', { infer: true });
    if (!token) throw new MercasistError(503, 'Mercasist no está configurado.');
    const base = this.config.get('MERCASIST_API_URL', { infer: true }).replace(/\/+$/, '');

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(body !== undefined && { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new MercasistError(
          503,
          `No se pudo conectar con Mercasist: ${(error as Error).message}`,
        );
      }
      this.readQuota(res.headers);
      const text = await res.text();

      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        if (attempt < MAX_RETRIES && Number.isFinite(wait) && wait <= MAX_WAIT_S) {
          await this.sleep(Math.max(1, wait) * 1000);
          continue;
        }
      }
      if (!res.ok) throw new MercasistError(res.status, describeError(res.status, text));
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new MercasistError(502, 'Mercasist respondió algo que no es JSON.');
      }
    }
  }

  /** Separate so tests don't wait. */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readQuota(headers: Headers): void {
    const remainingDay = headers.get('X-RateLimit-Remaining-Day');
    if (remainingDay === null) return;
    const limitDay = headers.get('X-RateLimit-Limit-Day');
    this.lastQuota = {
      remainingDay: Number(remainingDay),
      ...(limitDay !== null && { limitDay: Number(limitDay) }),
      at: new Date().toISOString(),
    };
  }
}

function withQuery(path: string, query?: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Mercasist answers `{ "error": "..." }`, in Spanish. */
export function describeError(status: number, text: string): string {
  let message: string | undefined;
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    const raw = body?.error ?? body?.message;
    if (typeof raw === 'string' && raw.trim()) message = raw.trim();
  } catch {
    // not JSON
  }
  if (status === 401) return 'Mercasist rechazó el token de la API (revisa MERCASIST_API_TOKEN).';
  if (status === 429) return message ?? 'Se alcanzó el límite de solicitudes de Mercasist.';
  return message ? `Mercasist: ${message}` : `Mercasist respondió ${status}.`;
}
