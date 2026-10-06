/** Statuses a proxy in front of a store's bridge (Cloudflare) answers with
 * while the store PC or its tunnel blinks — worth one more try. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 3_000;

/**
 * GET against one of the on-premise Profit Plus bridges. Retries once on a
 * network error or a transient 502/503/504, and on failure throws an error
 * a person can read in the sync log: the status plus one line, instead of
 * the full HTML error page the proxy sends back.
 */
export async function fetchBridge(
  url: string,
  init: RequestInit,
  label: string,
  retryDelayMs = RETRY_DELAY_MS,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      if (!last) {
        await sleep(retryDelayMs);
        continue;
      }
      throw new Error(`${label} no respondió: ${(error as Error).message}`);
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
