import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShoppingCart,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  PackageSearch,
  Menu,
  Boxes,
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Link to="/" className="shrink-0">
          <ElectronLogo layout="full" tone="color" className="h-8 sm:h-9" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/catalog">Catálogo</NavLink>
          <NavLink to="/collections">Colecciones</NavLink>
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
                <DropdownMenuItem asChild className="gap-2">
                  <Link to="/quotes">
                    <FileText className="h-4 w-4" />
                    Cotizaciones
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

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <div className="border-b border-border p-4">
            <ElectronLogo layout="full" tone="color" className="h-8" />
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <MobileNavLink to="/catalog" icon={Boxes} onNavigate={closeMobileNav}>
              Catálogo
            </MobileNavLink>
            <MobileNavLink to="/collections" icon={PackageSearch} onNavigate={closeMobileNav}>
              Colecciones
            </MobileNavLink>
            <MobileNavLink
              to="/quotes"
              search={{ new: true }}
              icon={FileText}
              onNavigate={closeMobileNav}
            >
              Cotizar
            </MobileNavLink>
            <RoleGate allow={["admin", "warehouse_operator"]}>
              <MobileNavLink to="/admin" icon={LayoutDashboard} onNavigate={closeMobileNav}>
                Panel
              </MobileNavLink>
            </RoleGate>
            {user && (
              <>
                <div className="my-2 border-t border-border" />
                <MobileNavLink to="/client/orders" icon={PackageSearch} onNavigate={closeMobileNav}>
                  Mis pedidos
                </MobileNavLink>
                <MobileNavLink to="/quotes" icon={FileText} onNavigate={closeMobileNav}>
                  Cotizaciones
                </MobileNavLink>
                <button
                  onClick={() => {
                    closeMobileNav();
                    void signOutUser();
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </>
            )}
          </nav>
          {!user && (
            <div className="border-t border-border p-3">
              <Link to="/login" search={{ redirect: pathname }} onClick={closeMobileNav}>
                <Button className="w-full gap-2 bg-brand-blue text-white hover:bg-brand-blue/90">
                  <LogIn className="h-4 w-4" />
                  Iniciar sesión
                </Button>
              </Link>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </header>
  );
}

function MobileNavLink({
  to,
  search,
  icon: Icon,
  onNavigate,
  children,
}: {
  to: string;
  search?: Record<string, unknown>;
  icon: typeof FileText;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      search={search}
      onClick={onNavigate}
      activeProps={{ className: "bg-brand-surface text-brand-blue" }}
      inactiveProps={{ className: "text-brand-navy hover:bg-brand-surface" }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
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
