/** Canonical public origin for absolute URLs (canonical links, og:url, JSON-LD,
 * sitemap). Override with VITE_PUBLIC_SITE_URL once the custom domain is live —
 * until then this points at the current Firebase Hosting URL. */
export const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL ?? "https://electronplus-ve.web.app"
).replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Default share card (og:image / twitter:image). Absolute by requirement —
 * Facebook, WhatsApp, LinkedIn and X all reject relative paths. 1200x630 is
 * the ratio every one of them crops to, and it's a JPG because none of them
 * render SVG, which is all the brand assets ship as. Product pages override
 * this with the product photo when they have one. */
export const OG_IMAGE = absoluteUrl("/og-image.jpg");
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
export const OG_IMAGE_ALT = "Electron Plus — iluminación, cables y materiales eléctricos";
