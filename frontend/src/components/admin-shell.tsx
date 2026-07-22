import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Receipt,
  PackageSearch,
  QrCode,
  ArrowLeft,
  ClipboardList,
  FileCheck2,
  Users,
} from "lucide-react";
import { ElectronLogo } from "./electron-logo";
import { PageTransition } from "./motion-primitives";
import { useElectronStore, type UserRole } from "@/lib/electron-store";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<UserRole, string> = {
  guest: "Invitado",
  client: "Cliente",
  admin: "Administrador",
  warehouse_operator: "Operador de almacén",
};

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/quotes", label: "Cotizaciones", icon: FileCheck2 },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/purchases", label: "Compras & Facturas", icon: Receipt },
  { to: "/admin/purchase-orders", label: "Órdenes de Compra", icon: ClipboardList },
  { to: "/admin/stock", label: "Alertas de stock", icon: PackageSearch },
  { to: "/admin/labels", label: "Etiquetas QR", icon: QrCode },
];

/**
 * Presentational layout for the admin panel. Access control lives one level
 * up, in the /admin layout route (see components/admin-guard.tsx) — by the
 * time this renders, the session is guaranteed to be an authorized
 * admin/warehouse operator.
 */
export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useElectronStore();

  return (
    <div className="flex min-h-screen bg-brand-surface">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-navy text-white lg:flex">
        <div className="border-b border-white/10 p-4">
          <ElectronLogo layout="full" tone="white" className="h-8" />
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-brand-yellow">
            Panel administrativo
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-brand-yellow text-brand-navy" : "text-white/85 hover:bg-white/10"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link to="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a la tienda
            </Button>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Electron Plus · Admin
            </div>
            <h1 className="truncate text-xl font-bold text-brand-navy sm:text-2xl">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-brand-surface px-3 py-1 text-xs font-medium text-brand-navy sm:inline-block">
              Rol activo: <b className="text-brand-blue">{ROLE_LABEL[role]}</b>
            </span>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6">
          <PageTransition>{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
