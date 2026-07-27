import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PackageX, ShoppingCart } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSuppliers } from "@/components/supplier-picker";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/stock")({
  head: () => ({
    meta: [
      { title: "Alertas de stock · Admin Electron Plus" },
      {
        name: "description",
        content: "Detecta productos con stock bajo o agotado en tiempo real.",
      },
      { property: "og:title", content: "Alertas de stock · Electron Plus" },
      { property: "og:description", content: "Prioriza reposiciones críticas." },
    ],
  }),
  component: StockPage,
});

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  supplierId?: string;
  cost?: number;
  stock: number;
  minStockThreshold?: number;
  imageUrl?: string;
}

// Shared queryKey with admin.index.tsx / admin.suppliers.tsx / the default
// (no search) state of admin.inventory.tsx and admin.labels.tsx.
function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products", ""],
    queryFn: () => apiFetch<AdminProduct[]>("/products/admin"),
  });
}

function StockPage() {
  const { data: products, isLoading } = useAdminProducts();
  const { data: suppliers } = useSuppliers();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const all = products ?? [];
  const outOfStock = all.filter((p) => p.stock === 0);
  const lowStock = all.filter(
    (p) => p.stock > 0 && (p.minStockThreshold ?? 0) > 0 && p.stock <= p.minStockThreshold!,
  );
  const critical = [...outOfStock, ...lowStock].sort((a, b) => a.stock - b.stock);
  const healthy = all.filter((p) => !critical.includes(p));

  const supplierName = (id?: string) => suppliers?.find((s) => s.id === id)?.name;

  const reorderGroups = new Map<string, AdminProduct[]>();
  const unassigned: AdminProduct[] = [];
  for (const p of critical) {
    if (p.supplierId) {
      if (!reorderGroups.has(p.supplierId)) reorderGroups.set(p.supplierId, []);
      reorderGroups.get(p.supplierId)!.push(p);
    } else {
      unassigned.push(p);
    }
  }

  const generateOrder = useMutation({
    mutationFn: ({ supplierId, items }: { supplierId: string; items: AdminProduct[] }) => {
      const name = supplierName(supplierId) ?? "Proveedor";
      return apiFetch("/purchase-orders", {
        method: "POST",
        body: {
          supplierId,
          supplierName: name,
          items: items.map((p) => ({
            productId: p.id,
            quantityOrdered: Math.max(1, (p.minStockThreshold ?? 10) * 2 - p.stock),
            unitCost: p.cost ?? 0,
            discountPerItem: 0,
          })),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "purchase-orders"] });
      toast.success("Orden de compra generada como borrador — revísala en Órdenes de Compra");
      navigate({ to: "/admin/purchase-orders" });
    },
    onError: reportError,
  });

  return (
    <AdminShell title="Alertas de stock en tiempo real">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-destructive/15 text-destructive">
              <PackageX className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Agotados</div>
              <div className="text-2xl font-bold text-brand-navy">{outOfStock.length}</div>
            </div>
          </div>
        </Card>
        <Card className="border-brand-yellow/40 bg-brand-yellow/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-yellow/40 text-brand-navy">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Bajo el stock seguro</div>
              <div className="text-2xl font-bold text-brand-navy">{lowStock.length}</div>
            </div>
          </div>
        </Card>
      </div>

      {isLoading &&
        [0, 1].map((i) => (
          <Card key={i} className="mt-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-9 w-44 rounded-md" />
            </div>
          </Card>
        ))}

      {!isLoading && critical.length === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          Ningún producto está por debajo de su stock seguro.
        </Card>
      )}

      {[...reorderGroups.entries()].map(([supplierId, items]) => (
        <Card key={supplierId} className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-brand-navy">
                {supplierName(supplierId)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {items.length} producto(s) por debajo de su stock seguro.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              disabled={generateOrder.isPending}
              onClick={() => generateOrder.mutate({ supplierId, items })}
            >
              <ShoppingCart className="h-4 w-4" /> Generar orden de compra
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((p) => (
              <StockRow key={p.id} product={p} />
            ))}
          </div>
        </Card>
      ))}

      {unassigned.length > 0 && (
        <Card className="mt-6 p-6">
          <h3 className="text-base font-semibold text-brand-navy">Sin proveedor asignado</h3>
          <p className="text-xs text-muted-foreground">
            Asigna un proveedor en Inventario para poder generar una orden de compra
            automáticamente.
          </p>
          <div className="mt-4 space-y-3">
            {unassigned.map((p) => (
              <StockRow key={p.id} product={p} />
            ))}
          </div>
        </Card>
      )}

      {healthy.length > 0 && (
        <Card className="mt-6 p-6">
          <h3 className="text-base font-semibold text-brand-navy">Inventario saludable</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {healthy.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-border py-2 last:border-0"
              >
                <div>
                  <div className="font-medium text-brand-navy">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                </div>
                <div className="text-sm font-semibold text-brand-blue">{p.stock} uds</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AdminShell>
  );
}

function StockRow({ product }: { product: AdminProduct }) {
  const out = product.stock === 0;
  const target = Math.max(product.minStockThreshold ?? 0, 1) * 2;
  const pct = Math.min(100, (product.stock / target) * 100);
  return (
    <div className="flex items-center gap-4 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-navy">{product.name}</div>
            <div className="text-xs text-muted-foreground">
              {product.sku}
              {product.minStockThreshold ? ` · Stock seguro: ${product.minStockThreshold}` : ""}
            </div>
          </div>
          {out ? (
            <Badge className="bg-destructive text-white">Agotado</Badge>
          ) : (
            <Badge className="bg-brand-yellow text-brand-navy">Stock bajo</Badge>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground">{product.stock} uds</span>
        </div>
      </div>
    </div>
  );
}
