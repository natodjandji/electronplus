import { Navigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { useElectronStore } from "@/lib/electron-store";
import { useAuth } from "@/lib/auth-context";

/**
 * Routing-level RBAC for the entire /admin subtree (mounted once in the
 * /admin layout route — child pages never re-implement checks):
 *
 * - session still resolving → neutral loading screen (no admin UI leaks)
 * - signed out             → redirect to /login (the single entry point for
 *                             both clients and admins), remembering where to
 *                             return to
 * - backend sync failed    → retry screen — a transient /auth/session
 *                             failure must not look identical to "not an
 *                             admin" (see sessionError's doc comment)
 * - signed in, not ops     → automatic redirect to the shop
 * - admin / warehouse op   → renders the panel
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isOps } = useElectronStore();
  const { user, loading, sessionError, retrySession } = useAuth();
  const livePathname = useRouterState({ select: (s) => s.location.pathname });
  // Snapshotted once on mount (lazy initializer runs only on first render) —
  // a live subscription would re-derive this from the *new* location while
  // the redirect to /login is still committing, clobbering the search param
  // with "/login" itself.
  const [entryPathname] = useState(() => livePathname);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-blue">
        <Loader2
          className="h-6 w-6 animate-spin text-brand-yellow"
          aria-label="Verificando sesión"
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ redirect: entryPathname }} replace />;
  }

  if (sessionError) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-blue px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-white">
          <p className="text-sm text-white/80">
            No pudimos verificar tu sesión con el servidor. Puede ser un problema de conexión
            temporal.
          </p>
          <button
            type="button"
            onClick={() => void retrySession()}
            className="inline-flex items-center gap-2 rounded-full bg-brand-yellow px-4 py-2 text-sm font-semibold text-brand-navy transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!isOps) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
