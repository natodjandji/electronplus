/** Canonical public origin for absolute URLs (canonical links, og:url, JSON-LD,
 * sitemap). Override with VITE_PUBLIC_SITE_URL once the custom domain is live —
 * until then this points at the current Firebase Hosting URL. */
export const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL ?? "https://electronplus-ve.web.app"
).replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
