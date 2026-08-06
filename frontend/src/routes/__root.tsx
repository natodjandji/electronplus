import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth-context";
import { ElectronStoreProvider } from "@/lib/electron-store";
import { OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_URL } from "@/lib/site-url";
import { useRealtimeOpsSync } from "@/lib/use-realtime-ops-sync";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-brand-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-brand-navy">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

// A chunk fetch can fail two different ways: (1) genuinely stale — a tab
// left open across a deploy tries to fetch a route's *old* chunk filename,
// which no longer exists on the server; or (2) transient — confirmed in
// production behind Cloudflare-proxied custom domains, where a handful of
// concurrent chunk requests intermittently fail even though the file is
// present and correct (re-fetching moments later succeeds). Both look
// identical to the app: a rejected dynamic import(). A couple of retries
// covers (2); reloading fetches the current shell and covers (1).
//
// Matching this by Error.message (as an earlier version of this fix did)
// is unreliable: Chrome, Firefox and Safari each phrase a failed dynamic
// import() differently, and a browser whose wording isn't in the regex
// never triggers the recovery reload. Vite instruments every dynamic
// import() it emits and always fires this event first, with consistent
// shape, regardless of browser or wording, so listen for that instead of
// pattern-matching text.
//
// Registered at module scope, not inside a React effect: the failing
// import is often the very chunk the router needs to render the current
// route, which can be requested *before* React ever commits and runs
// effects. An effect-scoped listener registers too late to catch that
// first, most common case.
const STALE_CHUNK_RELOAD_KEY = "ep-stale-chunk-reload-count";
const MAX_RELOAD_ATTEMPTS = 3;

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    // Deliberately NOT calling event.preventDefault(): doing so stops Vite
    // from rethrowing the original rejection, which leaves the caller
    // (the router, mid-route-resolution) holding an undefined module
    // instead of a rejected promise — it then crashes trying to read
    // `.component` off that undefined value, in a tight synchronous loop
    // with no error boundary catching it (confirmed live: blank white
    // page, console spammed instantly, worse than the plain error screen
    // this fix exists to recover from). Letting it rethrow keeps the
    // normal, working path: the router's own error boundary catches it
    // and shows the "Esta página no cargó" screen while the reload below
    // is in flight.
    const attempts = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? "0");
    if (attempts >= MAX_RELOAD_ATTEMPTS) return;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(attempts + 1));
    // A short, increasing delay gives a transient proxy/connection hiccup
    // a moment to clear before the retry, instead of hitting it again
    // instantly.
    setTimeout(() => window.location.reload(), 200 * (attempts + 1));
  });
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-brand-navy">
          Esta página no cargó
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo salió mal. Intenta refrescar o vuelve al inicio.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue/90"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-white px-4 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-surface"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Electron Plus · Iluminación y materiales eléctricos" },
      {
        name: "description",
        content:
          "Electron Plus: tienda especializada en iluminación, cables y materiales eléctricos. Precios detal y mayorista, cotizaciones y panel administrativo.",
      },
      { name: "author", content: "Electron Plus" },
      // Site-wide default. Public routes are indexable; every private route
      // (admin/*, client/*, cart, checkout, login, register, quotes) sets its
      // own noindex, and robots.txt disallows them as a second layer.
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Electron Plus · Iluminación y materiales eléctricos" },
      {
        property: "og:description",
        content: "Catálogo, cotizaciones y gestión operativa para Electron Plus.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Electron Plus" },
      { property: "og:locale", content: "es_VE" },
      { property: "og:url", content: SITE_URL },
      // Without an og:image, a link shared on WhatsApp — the main channel
      // here — renders as a bare text row with no preview. Declared once
      // globally so every page inherits it; product pages override with the
      // product photo when one exists.
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: OG_IMAGE_WIDTH },
      { property: "og:image:height", content: OG_IMAGE_HEIGHT },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { property: "og:image:type", content: "image/jpeg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // Self-hosted brand font (see styles.css's @font-face) — preloaded
      // since it's the only font the site loads now, no Google Fonts CDN
      // round trip to race against.
      {
        rel: "preload",
        href: "/fonts/Geomini-VariableFont_wght.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Needs to run inside ElectronStoreProvider (for isOps) but renders
// nothing — a plain function component is the only way to call a hook at
// this point in the tree, RootComponent itself sits above the provider.
function RealtimeOpsSync() {
  useRealtimeOpsSync();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // A successful render means the app is on a working bundle — clear the
  // retry counter so a *later*, unrelated chunk failure (same tab, still
  // open) gets its own fresh set of retries instead of inheriting an
  // exhausted count from earlier in this tab's session.
  useEffect(() => {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ElectronStoreProvider>
          <RealtimeOpsSync />
          <Outlet />
          <Toaster richColors position="top-right" offset={{ top: "80px", right: "16px" }} />
        </ElectronStoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
