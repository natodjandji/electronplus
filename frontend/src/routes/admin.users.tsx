import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { BackendRole } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Usuarios · Admin Electron Plus" },
      { name: "description", content: "Gestiona los roles de acceso de las cuentas del sistema." },
    ],
  }),
  component: AdminUsersPage,
});

interface AppUser {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: BackendRole;
  active: boolean;
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
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useUsers();

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: BackendRole }) =>
      apiFetch(`/users/${id}`, { method: "PATCH", body: { role } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Rol actualizado");
    },
    onError: reportError,
  });

  return (
    <AdminShell title="Usuarios">
      <p className="mb-4 text-sm text-muted-foreground">
        Ascender o degradar una cuenta entre cliente, administrador y operador de almacén.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando usuarios…
        </div>
      )}

      {!isLoading && users?.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No hay usuarios registrados todavía.
        </Card>
      )}

      {users && users.length > 0 && (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
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
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge className={ROLE_BADGE[u.role]}>
                  {u.role === "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                  {ROLE_LABEL[u.role]}
                </Badge>
                <Select
                  value={u.role}
                  onValueChange={(role) =>
                    updateRole.mutate({ id: u.id, role: role as BackendRole })
                  }
                  disabled={updateRole.isPending}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABEL) as BackendRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
