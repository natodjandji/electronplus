import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronRight,
  FileCheck2,
  Loader2,
  PackageSearch,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { CardListSkeleton } from "@/components/table-skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatMoneyAdmin } from "@/lib/electron-store";
import type { BackendRole } from "@/lib/auth-context";
import {
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@/components/order-stepper";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

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

/** Orders whose value counts as realized spend — mirrors reports.service.ts REVENUE_STATUSES. */
const SPENT_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "fulfilled"];

function quoteTotal(q: QuoteSummary): number {
  const subtotal = q.items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - i.discountPct / 100), 0);
  return subtotal * (1 - q.globalDiscountPct / 100);
}

function totalSpent(orders: OrderSummary[]): number {
  return orders
    .filter((o) => SPENT_STATUSES.includes(o.status))
    .reduce((s, o) => s + o.totalAmount, 0);
}

function useUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<AppUser[]>("/users"),
  });
}

function UserIdentity({ user }: { user: AppUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-9 w-9">
        <AvatarImage src={user.photoURL} alt={user.displayName ?? ""} />
        <AvatarFallback>
          {(user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-semibold text-brand-navy">
          {user.displayName || user.email}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {user.email} · Registrado el {formatDate(user.createdAt)}
        </div>
      </div>
    </div>
  );
}

function AdminUsersPage() {
  const { data: users, isLoading } = useUsers();
  const [selectedClient, setSelectedClient] = useState<AppUser | null>(null);

  const admins = (users ?? []).filter((u) => u.role === "admin");
  const operators = (users ?? []).filter((u) => u.role === "warehouse_operator");
  const clients = (users ?? []).filter((u) => u.role === "client");

  return (
    <AdminShell title="Usuarios">
      <p className="mb-6 text-sm text-muted-foreground">
        Cuentas registradas, agrupadas por rol. El rol de administrador no puede otorgarse desde
        este panel.
      </p>

      {isLoading && <CardListSkeleton rows={5} />}

      {!isLoading && (
        <div className="space-y-8">
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <ShieldCheck className="h-4 w-4 text-brand-blue" /> Administradores
            </div>
            {admins.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No hay administradores.
              </Card>
            ) : (
              <div className="space-y-2">
                {admins.map((u) => (
                  <Card
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <UserIdentity user={u} />
                    <Badge className={ROLE_BADGE.admin}>Administrador</Badge>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <Warehouse className="h-4 w-4 text-brand-blue" /> Almacenistas
            </div>
            {operators.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No hay operadores de almacén.
              </Card>
            ) : (
              <div className="space-y-2">
                {operators.map((u) => (
                  <OperatorCard key={u.id} user={u} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <Users className="h-4 w-4 text-brand-blue" /> Clientes
            </div>
            {clients.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No hay clientes registrados.
              </Card>
            ) : (
              <div className="space-y-2">
                {clients.map((u) => (
                  <Card
                    key={u.id}
                    onClick={() => setSelectedClient(u)}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-brand-blue/40"
                  >
                    <UserIdentity user={u} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {selectedClient && (
        <ClientDetailDialog user={selectedClient} onClose={() => setSelectedClient(null)} />
      )}
    </AdminShell>
  );
}

function OperatorCard({ user }: { user: AppUser }) {
  const queryClient = useQueryClient();

  const demote = useMutation({
    mutationFn: () => apiFetch(`/users/${user.id}`, { method: "PATCH", body: { role: "client" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Rol actualizado");
    },
    onError: reportError,
  });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
      <UserIdentity user={user} />
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        disabled={demote.isPending}
        onClick={() => demote.mutate()}
      >
        <Users className="h-3.5 w-3.5" /> Volver a cliente
      </Button>
    </Card>
  );
}

function ClientDetailDialog({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["admin", "users", user.id, "quotes"],
    queryFn: () => apiFetch<QuoteSummary[]>(`/quotes?userId=${user.id}`),
  });
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin", "users", user.id, "orders"],
    queryFn: () => apiFetch<OrderSummary[]>(`/orders?userId=${user.id}`),
  });

  const promote = useMutation({
    mutationFn: () =>
      apiFetch(`/users/${user.id}`, { method: "PATCH", body: { role: "warehouse_operator" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Rol actualizado");
      onClose();
    },
    onError: reportError,
  });

  const spent = totalSpent(orders ?? []);

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
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

          <Card className="bg-brand-blue/5 p-3 text-center">
            <div className="text-xs text-muted-foreground">Total gastado</div>
            <div className="text-2xl font-bold text-brand-navy">
              {ordersLoading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                formatMoneyAdmin(spent)
              )}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setQuotesOpen(true)}>
              <FileCheck2 className="h-4 w-4" /> Cotizaciones ({quotes?.length ?? 0})
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setOrdersOpen(true)}>
              <PackageSearch className="h-4 w-4" /> Pedidos ({orders?.length ?? 0})
            </Button>
          </div>

          <Separator />

          <div className="grid gap-1.5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Rol de la cuenta
            </div>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start gap-2"
              disabled={promote.isPending}
              onClick={() => promote.mutate()}
            >
              <Warehouse className="h-3.5 w-3.5" /> Convertir en operador de almacén
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quotesOpen} onOpenChange={setQuotesOpen}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cotizaciones de {user.displayName || user.email}</DialogTitle>
          </DialogHeader>
          {quotesLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {!quotesLoading && (quotes?.length ?? 0) === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Sin cotizaciones registradas.
            </div>
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
                      {formatMoneyAdmin(quoteTotal(q))}
                    </div>
                  </div>
                  <Badge className={QUOTE_STATUS_BADGE[q.status]}>
                    {QUOTE_STATUS_LABEL[q.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ordersOpen} onOpenChange={setOrdersOpen}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedidos de {user.displayName || user.email}</DialogTitle>
          </DialogHeader>
          {ordersLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {!ordersLoading && (orders?.length ?? 0) === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Sin pedidos registrados.
            </div>
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
                      {formatMoneyAdmin(o.totalAmount)}
                    </div>
                  </div>
                  <Badge className={ORDER_STATUS_BADGE[o.status]}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
