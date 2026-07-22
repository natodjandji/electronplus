import { Link, useRouterState } from "@tanstack/react-router";
import {
  ShoppingCart,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  PackageSearch,
} from "lucide-react";
import { ElectronLogo } from "./electron-logo";
import { useElectronStore, type UserRole } from "@/lib/electron-store";
import { useAuth } from "@/lib/auth-context";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<UserRole, string> = {
  guest: "Invitado",
  client: "Cliente",
  admin: "Administrador",
  warehouse_operator: "Operador de almacén",
};

export function SiteHeader() {
  const { cartCount, role } = useElectronStore();
  const { user, profile, loading, signOutUser } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <ElectronLogo layout="full" tone="color" className="h-8 sm:h-9" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/catalog">Catálogo</NavLink>
          <NavLink to="/quotes">Cotizaciones</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link to="/quotes" search={{ new: true }}>
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-2 text-brand-blue hover:bg-brand-yellow/15 hover:text-brand-navy sm:inline-flex"
            >
              <FileText className="h-4 w-4" />
              Cotizar
            </Button>
          </Link>

          <RoleGate allow={["admin", "warehouse_operator"]}>
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="hidden gap-2 md:inline-flex">
                <LayoutDashboard className="h-4 w-4" />
                Panel
              </Button>
            </Link>
          </RoleGate>

          <Link to="/cart">
            <Button
              size="sm"
              className="relative gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {cartCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-yellow px-1.5 text-xs font-bold text-brand-navy">
                  {cartCount}
                </span>
              )}
            </Button>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage
                      src={profile?.photoURL ?? user.photoURL ?? undefined}
                      alt={profile?.displayName ?? ""}
                    />
                    <AvatarFallback className="text-[10px]">
                      {(profile?.displayName ?? user.displayName ?? user.email ?? "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">
                    {loading ? "Cargando…" : (profile?.displayName ?? user.displayName ?? "Cuenta")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{ROLE_LABEL[role]}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="gap-2">
                  <Link to="/client/orders">
                    <PackageSearch className="h-4 w-4" />
                    Mis pedidos
                  </Link>
                </DropdownMenuItem>
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
          ) : (
            <Link to="/login" search={{ redirect: pathname }}>
              <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Iniciar sesión</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "text-brand-blue bg-brand-surface" }}
      inactiveProps={{ className: "text-brand-navy" }}
      className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-surface"
    >
      {children}
    </Link>
  );
}
