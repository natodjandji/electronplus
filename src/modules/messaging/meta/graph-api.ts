import { summarizeBody } from '../../../common/http/fetch-bridge';

/** A chat reply that sits behind a slow Meta call is a reply the customer
 * waits for; past this, give up and let the run report it. */
const GRAPH_TIMEOUT_MS = 20_000;

/** Meta's Graph API (graph.facebook.com), which both WhatsApp Cloud API and
 * Instagram messaging go through. Throws a readable one-liner on failure. */
export async function graphRequest<T>(
  version: string,
  path: string,
  token: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Meta ${path.split('?')[0]} respondió ${res.status}: ${graphError(await res.text())}`,
    );
  }
  return (await res.json()) as T;
}

/** Meta puts the useful part in error.message; fall back to the raw body. */
function graphError(body: string): string {
  try {
    const message = (JSON.parse(body) as { error?: { message?: string } }).error?.message;
    if (message) return message;
  } catch {
    // Not JSON — summarize whatever came back.
  }
  return summarizeBody(body);
}

/** Bytes of a media file (customer photo), capped so a huge upload can't
 * blow the request's memory. */
export async function fetchMedia(
  url: string,
  token?: string,
  maxBytes = 5 * 1024 * 1024,
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`La descarga del archivo respondió ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new Error('Archivo demasiado grande');
  return { data, mimeType: res.headers.get('content-type')?.split(';')[0] ?? '' };
}
