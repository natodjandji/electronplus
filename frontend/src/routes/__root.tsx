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

// Every deploy renames every JS chunk (content-hashed filenames). A tab
// left open across a deploy that then navigates to a route it hasn't
// loaded yet tries to fetch that route's *old* chunk filename, which no
// longer exists on the server — this is what a dynamic import failure
// looks like, not an actual app bug. One automatic reload fetches the
// current shell (with correct chunk references) and resolves it; the
// sessionStorage guard stops a genuinely broken chunk from reload-looping.
const STALE_CHUNK_RELOAD_KEY = "ep-stale-chunk-reload";
function isStaleChunkError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module/i.test(
    error.message,
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  useEffect(() => {
    if (!isStaleChunkError(error)) return;
    if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
    window.location.reload();
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
      { property: "og:title", content: "Electron Plus · Iluminación y materiales eléctricos" },
      {
        property: "og:description",
        content: "Catálogo, cotizaciones y gestión operativa para Electron Plus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // A successful render means the app is on a working bundle — clear the
  // stale-chunk reload guard so a *later* deploy (same tab, still open)
  // can also trigger one recovery reload instead of being permanently
  // blocked by a flag set earlier in this tab's session.
  useEffect(() => {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ElectronStoreProvider>
          <Outlet />
          <Toaster richColors position="top-right" offset={{ top: "80px", right: "16px" }} />
        </ElectronStoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
