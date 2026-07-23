import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Loader2, Mail, Phone, Plus } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateSupplierDialog, useSuppliers } from "@/components/supplier-picker";
import { apiFetch } from "@/lib/api-client";

export const Route = createFileRoute("/admin/suppliers")({
  head: () => ({
    meta: [
      { title: "Proveedores · Admin Electron Plus" },
      {
        name: "description",
        content: "Directorio de proveedores y los productos que les compras.",
      },
    ],
  }),
  component: SuppliersPage,
});

interface AdminProduct {
  id: string;
  supplierId?: string;
}

function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => apiFetch<AdminProduct[]>("/products/admin"),
  });
}

function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: products } = useAdminProducts();
  const [creating, setCreating] = useState(false);

  const productCount = (supplierId: string) =>
    (products ?? []).filter((p) => p.supplierId === supplierId).length;

  return (
    <AdminShell title="Proveedores">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Asocia cada producto a un proveedor desde Inventario para poder filtrarlos aquí.
        </p>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proveedores…
        </div>
      )}

      {!isLoading && (suppliers?.length ?? 0) === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No hay proveedores registrados todavía.
        </Card>
      )}

      {suppliers && suppliers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-brand-navy">{s.name}</div>
                  {s.taxId && <div className="text-xs text-muted-foreground">{s.taxId}</div>}
                  <div className="mt-1 text-xs font-medium text-brand-blue">
                    {productCount(s.id)} producto(s) asociado(s)
                  </div>
                  {s.contactEmail && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> {s.contactEmail}
                    </div>
                  )}
                  {s.contactPhone && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {s.contactPhone}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateSupplierDialog onClose={() => setCreating(false)} />}
    </AdminShell>
  );
}
