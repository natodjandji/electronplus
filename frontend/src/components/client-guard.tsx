import { Navigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * Routing-level guard for authenticated-customer pages (e.g. /client/orders):
 * unlike AdminGuard, any signed-in role is allowed through — this just
 * ensures the visitor is a real account before hitting endpoints scoped to
 * `request.auth.uid` (like GET /orders/mine).
 */
export function ClientGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const livePathname = useRouterState({ select: (s) => s.location.pathname });
  const [entryPathname] = useState(() => livePathname);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-surface">
        <Loader2 className="h-6 w-6 animate-spin text-brand-blue" aria-label="Verificando sesión" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ redirect: entryPathname }} replace />;
  }

  return <>{children}</>;
}
