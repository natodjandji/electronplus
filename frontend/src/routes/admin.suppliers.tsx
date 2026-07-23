import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Loader2, Mail, Phone, Plus } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateSupplierDialog, useSuppliers, type Supplier } from "@/components/supplier-picker";
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
  sku: string;
  name: string;
  stock: number;
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
  const [selected, setSelected] = useState<Supplier | null>(null);

  const productsFor = (supplierId: string) =>
    (products ?? []).filter((p) => p.supplierId === supplierId);

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
            <Card
              key={s.id}
              onClick={() => setSelected(s)}
              className="cursor-pointer p-4 transition-colors hover:border-brand-blue/40"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-brand-navy">{s.name}</div>
                  {s.taxId && <div className="text-xs text-muted-foreground">{s.taxId}</div>}
                  <div className="mt-1 text-xs font-medium text-brand-blue">
                    {productsFor(s.id).length} producto(s) asociado(s)
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

      {selected && (
        <SupplierDetailDialog
          supplier={selected}
          products={productsFor(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </AdminShell>
  );
}

function SupplierDetailDialog({
  supplier,
  products,
  onClose,
}: {
  supplier: Supplier;
  products: AdminProduct[];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
              <Building2 className="h-5 w-5" />
            </div>
            <DialogTitle className="truncate">{supplier.name}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid gap-1.5 text-sm">
          {supplier.taxId && <div className="text-muted-foreground">RIF: {supplier.taxId}</div>}
          {supplier.contactEmail && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> {supplier.contactEmail}
            </div>
          )}
          {supplier.contactPhone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {supplier.contactPhone}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Productos asociados ({products.length})
          </div>
          {products.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Sin productos asociados. Asígnalos desde Inventario.
            </div>
          ) : (
            <div className="space-y-1.5">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-brand-navy">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </div>
                  <Badge className="bg-brand-blue/10 text-brand-blue">{p.stock} uds</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
