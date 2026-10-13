/** Statuses a proxy in front of a store's bridge (Cloudflare) answers with
 * while the store PC or its tunnel blinks — worth one more try. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 3_000;
/** Per attempt, body included. Both tries plus the wait stay well inside
 * Cloud Run's and Cloud Scheduler's 300 s, leaving time for the writes
 * after; a full secundaria run, writes and all, takes up to about 70 s. */
const ATTEMPT_TIMEOUT_MS = 90_000;

/**
 * GET against one of the on-premise Profit Plus bridges. Retries once on a
 * network error, a timeout or a transient 502/503/504, and on failure
 * throws an error a person can read in the sync log: the status plus one
 * line, instead of the full HTML error page the proxy sends back. A bridge
 * that hangs (SQL Server stuck, store PC asleep) gives up after the
 * timeout instead of holding the run until Cloud Run cuts it off.
 */
export async function fetchBridge(
  url: string,
  init: RequestInit,
  label: string,
  retryDelayMs = RETRY_DELAY_MS,
  timeoutMs = ATTEMPT_TIMEOUT_MS,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (!last) {
        await sleep(retryDelayMs);
        continue;
      }
      const reason =
        (error as Error).name === 'TimeoutError'
          ? `no respondió en ${Math.round(timeoutMs / 1000)} s`
          : `no respondió: ${(error as Error).message}`;
      throw new Error(`${label} ${reason}`);
    }
    if (res.ok) return res;
    if (TRANSIENT_STATUSES.has(res.status) && !last) {
      await res.body?.cancel();
      await sleep(retryDelayMs);
      continue;
    }
    throw new Error(`${label} respondió ${res.status}: ${summarizeBody(await res.text())}`);
  }
}

/** One readable line from an error body: an HTML page's <title>, or the
 * text with tags stripped, cut to 160 characters. */
export function summarizeBody(body: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1];
  const text = (title ?? body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return 'sin detalle';
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
