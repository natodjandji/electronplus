import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldCheck, Warehouse, FileCheck2, PackageSearch } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import type { BackendRole } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Usuarios · Admin Electron Plus" },
      {
        name: "description",
        content: "Gestiona los roles y revisa la actividad de las cuentas del sistema.",
      },
    ],
  }),
  component: AdminUsersPage,
});

interface AppUser {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
  role: BackendRole;
  active: boolean;
  createdAt: string;
}

type QuoteStatus = "draft" | "sent" | "approved" | "rejected";
type OrderStatus = "pending_payment_verification" | "paid" | "fulfilled" | "cancelled";

interface QuoteSummary {
  id: string;
  customerName: string;
  status: QuoteStatus;
  globalDiscountPct: number;
  items: { unitPrice: number; qty: number; discountPct: number }[];
  createdAt: string;
}

interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  items: { name: string; qty: number }[];
  createdAt: string;
}

const ROLE_LABEL: Record<BackendRole, string> = {
  client: "Cliente",
  admin: "Administrador",
  warehouse_operator: "Operador de almacén",
};

const ROLE_BADGE: Record<BackendRole, string> = {
  client: "border-transparent bg-muted text-muted-foreground",
  admin: "border-transparent bg-brand-blue/10 text-brand-blue",
  warehouse_operator: "border-transparent bg-brand-yellow/25 text-brand-navy",
};

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-brand-yellow/25 text-brand-navy",
  approved: "border-transparent bg-emerald-100 text-emerald-700",
  rejected: "border-transparent bg-destructive/10 text-destructive",
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment_verification: "Procesando",
  paid: "Pagado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
};

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment_verification: "border-transparent bg-brand-yellow/25 text-brand-navy",
  paid: "border-transparent bg-brand-blue/10 text-brand-blue",
  fulfilled: "border-transparent bg-emerald-100 text-emerald-700",
  cancelled: "border-transparent bg-destructive/10 text-destructive",
};

function quoteTotal(q: QuoteSummary): number {
  const subtotal = q.items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - i.discountPct / 100), 0);
  return subtotal * (1 - q.globalDiscountPct / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<AppUser[]>("/users"),
  });
}

function AdminUsersPage() {
  const { data: users, isLoading } = useUsers();
  const [selected, setSelected] = useState<AppUser | null>(null);

  const sorted = [...(users ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <AdminShell title="Usuarios">
      <p className="mb-4 text-sm text-muted-foreground">
        Cuentas registradas, más recientes primero. Selecciona una para ver su historial y cambiar
        su rol.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando usuarios…
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No hay usuarios registrados todavía.
        </Card>
      )}

      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((u) => (
            <Card
              key={u.id}
              onClick={() => setSelected(u)}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.photoURL} alt={u.displayName ?? ""} />
                  <AvatarFallback>
                    {(u.displayName ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-brand-navy">
                    {u.displayName || u.email}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email} · Registrado el {formatDate(u.createdAt)}
                  </div>
                </div>
              </div>

              <Badge className={ROLE_BADGE[u.role]}>
                {u.role === "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                {u.role === "warehouse_operator" && <Warehouse className="mr-1 h-3 w-3" />}
                {ROLE_LABEL[u.role]}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      {selected && <UserDetailDialog user={selected} onClose={() => setSelected(null)} />}
    </AdminShell>
  );
}

function UserDetailDialog({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["admin", "users", user.id, "quotes"],
    queryFn: () => apiFetch<QuoteSummary[]>(`/quotes?userId=${user.id}`),
  });
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin", "users", user.id, "orders"],
    queryFn: () => apiFetch<OrderSummary[]>(`/orders?userId=${user.id}`),
  });

  const updateRole = useMutation({
    mutationFn: (role: BackendRole) =>
      apiFetch(`/users/${user.id}`, { method: "PATCH", body: { role } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Rol actualizado");
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.photoURL} alt={user.displayName ?? ""} />
              <AvatarFallback>
                {(user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="truncate">{user.displayName || user.email}</DialogTitle>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Registrado: {formatDate(user.createdAt)}</div>
          {user.phone && <div>Teléfono: {user.phone}</div>}
          {user.taxId && <div>RIF/Cédula: {user.taxId}</div>}
          {user.city && user.state && (
            <div>
              Ubicación: {user.city}, {user.state}
            </div>
          )}
          {user.address && <div className="col-span-2">Dirección: {user.address}</div>}
        </div>

        <Separator />

        <div className="grid gap-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Rol de la cuenta
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROLE_LABEL) as BackendRole[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={user.role === r ? "default" : "outline"}
                className={
                  user.role === r
                    ? "gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                    : "gap-2"
                }
                disabled={updateRole.isPending || user.role === r}
                onClick={() => updateRole.mutate(r)}
              >
                {r === "admin" && <ShieldCheck className="h-3.5 w-3.5" />}
                {r === "warehouse_operator" && <Warehouse className="h-3.5 w-3.5" />}
                {ROLE_LABEL[r]}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <FileCheck2 className="h-3.5 w-3.5" /> Cotizaciones
          </div>
          {quotesLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
          {!quotesLoading && (quotes?.length ?? 0) === 0 && (
            <div className="text-sm text-muted-foreground">Sin cotizaciones registradas.</div>
          )}
          {quotes && quotes.length > 0 && (
            <div className="space-y-1.5">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</div>
                    <div className="font-semibold text-brand-navy">
                      {formatMoney(quoteTotal(q))}
                    </div>
                  </div>
                  <Badge className={QUOTE_STATUS_BADGE[q.status]}>
                    {QUOTE_STATUS_LABEL[q.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <PackageSearch className="h-3.5 w-3.5" /> Pedidos
          </div>
          {ordersLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
          {!ordersLoading && (orders?.length ?? 0) === 0 && (
            <div className="text-sm text-muted-foreground">Sin pedidos registrados.</div>
          )}
          {orders && orders.length > 0 && (
            <div className="space-y-1.5">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(o.createdAt)} · {o.items.length} producto(s)
                    </div>
                    <div className="font-semibold text-brand-navy">
                      {formatMoney(o.totalAmount)}
                    </div>
                  </div>
                  <Badge className={ORDER_STATUS_BADGE[o.status]}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
