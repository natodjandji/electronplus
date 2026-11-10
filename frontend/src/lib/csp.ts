/**
 * The storefront's Content-Security-Policy: what the pages may load, and
 * why each source is on the list. Firebase Hosting sends it from
 * firebase.json, which has no room for comments, so the reasons live here
 * and csp.test.ts fails if the two ever differ.
 *
 * It goes out as Content-Security-Policy-Report-Only for now: the browser
 * blocks nothing and reports what it would have blocked (csp-reports.ts
 * sends that to the API's logs). Once sign-in and checkout have run clean
 * under it, renaming the header in firebase.json enforces it.
 */

const API = "electronplus-api-771016935976.us-central1.run.app";
/** PayPal's checkout SDK, its buttons' frames and their images. */
const PAYPAL = ["https://*.paypal.com", "https://*.paypalobjects.com"];
/** Cloudflare sits in front of electronplus.com.ve and adds its Web
 * Analytics beacon to every page it serves: a script, and where it sends
 * the page's load times. */
const CLOUDFLARE_BEACON = "https://static.cloudflareinsights.com";
const CLOUDFLARE_BEACON_REPORTS = "https://cloudflareinsights.com";

export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    // The prerendered pages carry TanStack Start's inline scripts (hydration
    // data, scroll restoration). Their content changes with every build and
    // static hosting can't stamp a nonce on them, so inline scripts stay
    // allowed; scripts from other sites do not.
    "'unsafe-inline'",
    // The barcode reader's .wasm, served from this site (code-reader.ts),
    // where the browser has no BarcodeDetector of its own.
    "'wasm-unsafe-eval'",
    // Firebase Auth's Google sign-in.
    "https://apis.google.com",
    ...PAYPAL,
    CLOUDFLARE_BEACON,
  ],
  // React style props, motion and sonner all write inline styles.
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    // QR codes and barcodes drawn in the browser, and photo previews.
    "data:",
    "blob:",
    // Product photos, and the signed links to payment proofs.
    "https://firebasestorage.googleapis.com",
    "https://storage.googleapis.com",
    // Google account photos.
    "https://*.googleusercontent.com",
    ...PAYPAL,
  ],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    `https://${API}`,
    // Live notifications and stock (use-realtime-ops-sync.ts).
    `wss://${API}`,
    // Firebase Auth: sign-in, and renewing the session's token.
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    ...PAYPAL,
    CLOUDFLARE_BEACON_REPORTS,
  ],
  "frame-src": [
    // Firebase Auth's helper frame, on the project's auth domain.
    "https://electronplus-ve.firebaseapp.com",
    // PayPal's buttons and its payment window.
    "https://*.paypal.com",
  ],
  // The seller's camera preview while scanning a code.
  "media-src": ["'self'", "blob:"],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

export function buildCsp(directives: Record<string, string[]> = CSP_DIRECTIVES): string {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
