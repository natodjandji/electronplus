import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutDashboard, LogOut, Store } from "lucide-react";
import { ElectronLogo } from "@/components/electron-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useElectronStore } from "@/lib/electron-store";

/**
 * Frame for the in-store sales screens. The header matches the store's
 * (site-header.tsx): same logo, height, link and account-button styles;
 * the content below stays one column, built for a phone held in one hand.
 */
export function SellerShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, signOutUser } = useAuth();
  const { isAdmin } = useElectronStore();
  const name = profile?.displayName ?? user?.displayName ?? undefined;

  return (
    <div className="min-h-dvh bg-brand-surface print:min-h-0 print:bg-white">
      <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/vendedor" className="shrink-0" aria-label="Ventas en tienda">
            <ElectronLogo layout="full" tone="color" className="h-7 sm:h-9" />
          </Link>

          <nav className="flex items-center gap-1">
            <HeaderLink to="/vendedor">
              <span className="sm:hidden">Ventas</span>
              <span className="hidden sm:inline">Ventas en tienda</span>
            </HeaderLink>
            <HeaderLink to="/catalog" className="hidden md:inline-flex">
              Catálogo
            </HeaderLink>
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" className="hidden gap-2 md:inline-flex" asChild>
                <Link to="/admin">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="sr-only lg:not-sr-only">Panel</span>
                </Link>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 px-2.5 sm:px-3">
                  <Avatar className="h-5 w-5">
                    <AvatarImage
                      src={profile?.photoURL ?? user?.photoURL ?? undefined}
                      alt={name ?? ""}
                    />
                    <AvatarFallback className="text-[10px]">
                      {(name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="sr-only lg:not-sr-only">
                    {loading ? "Cargando…" : (name ?? "Cuenta")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{isAdmin ? "Administrador" : "Vendedor"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="gap-2">
                  <Link to="/catalog">
                    <Store className="h-4 w-4" />
                    Ver la tienda
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild className="gap-2">
                    <Link to="/admin">
                      <LayoutDashboard className="h-4 w-4" />
                      Panel de administración
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void signOutUser()}
                  className="gap-2 text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-36 pt-4">{children}</main>
    </div>
  );
}

/** The store header's nav link (site-header.tsx), so both bars read alike. */
function HeaderLink({
  to,
  className = "",
  children,
}: {
  to: "/vendedor" | "/catalog";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "text-brand-blue bg-brand-surface" }}
      inactiveProps={{ className: "text-brand-navy" }}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-surface ${className}`}
    >
      {children}
    </Link>
  );
}
