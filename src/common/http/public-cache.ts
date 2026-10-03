import type { Response } from 'express';

/**
 * Lets the browser reuse an anonymous catalog response briefly, so page hops
 * and quick revisits skip the request entirely. A signed-in response can
 * carry role-specific fields (an admin sees cost) and is never stored, and
 * `Vary: Authorization` keeps a cached anonymous copy from answering a
 * signed-in request.
 */
export function cacheIfAnonymous(res: Response, user: unknown, maxAgeSeconds = 60): void {
  res.vary('Authorization');
  res.setHeader('Cache-Control', user ? 'private, no-store' : `public, max-age=${maxAgeSeconds}`);
}
