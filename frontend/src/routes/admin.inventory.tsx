import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SupplierPicker, useSuppliers } from "@/components/supplier-picker";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario · Admin Electron Plus" },
      { name: "description", content: "Carga y administra los productos del catálogo." },
    ],
  }),
  component: InventoryPage,
});

interface Category {
  id: string;
  code: string;
  label: string;
}

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  specs?: string;
  categoryId: string;
  category: Category;
  supplierId?: string;
  retailPrice: number;
  wholesalePrice: number;
  cost?: number;
  stock: number;
  minStockThreshold?: number;
  imageUrl?: string;
  active: boolean;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
  });
}

function useAdminProducts(search: string) {
  return useQuery({
    queryKey: ["admin", "products", search],
    queryFn: () =>
      apiFetch<AdminProduct[]>(
        `/products/admin${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

function InventoryPage() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const { data: products, isLoading } = useAdminProducts(search);
  const { data: suppliers } = useSuppliers();

  const supplierName = (id?: string) => suppliers?.find((s) => s.id === id)?.name;

  return (
    <AdminShell title="Inventario">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o SKU…"
              className="w-64 pl-8"
            />
          </div>
        </div>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Stock seguro</th>
                <th className="px-4 py-2 text-right">Detal</th>
                <th className="px-4 py-2 text-right">Mayor</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && (products?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No hay productos con este filtro.
                  </td>
                </tr>
              )}
              {products?.map((p) => {
                const low = (p.minStockThreshold ?? 0) > 0 && p.stock <= p.minStockThreshold!;
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-border hover:bg-brand-surface"
                    onClick={() => setEditing(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-navy">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku} · {p.category.label}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplierName(p.supplierId) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={low ? "font-semibold text-destructive" : ""}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.minStockThreshold ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(p.retailPrice)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(p.wholesalePrice)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {low && (
                          <Badge className="gap-1 bg-brand-yellow text-brand-navy">
                            <AlertTriangle className="h-3 w-3" /> Bajo
                          </Badge>
                        )}
                        {!p.active && (
                          <Badge className="bg-muted text-muted-foreground">Inactivo</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && <ProductFormDialog onClose={() => setCreating(false)} />}
      {editing && <ProductFormDialog product={editing} onClose={() => setEditing(null)} />}
    </AdminShell>
  );
}

function ProductFormDialog({ product, onClose }: { product?: AdminProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const isEdit = Boolean(product);

  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [specs, setSpecs] = useState(product?.specs ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [supplierId, setSupplierId] = useState(product?.supplierId);
  const [retailPrice, setRetailPrice] = useState(product?.retailPrice ?? 0);
  const [wholesalePrice, setWholesalePrice] = useState(product?.wholesalePrice ?? 0);
  const [cost, setCost] = useState(product?.cost ?? 0);
  const [minStockThreshold, setMinStockThreshold] = useState(product?.minStockThreshold ?? 0);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [active, setActive] = useState(product?.active ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        sku,
        name,
        specs: specs || undefined,
        categoryId,
        supplierId: supplierId || undefined,
        retailPrice,
        wholesalePrice,
        cost: cost || undefined,
        minStockThreshold: minStockThreshold || undefined,
        imageUrl: imageUrl || undefined,
        active,
      };
      return isEdit
        ? apiFetch(`/products/${product!.id}`, { method: "PATCH", body })
        : apiFetch("/products", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success(isEdit ? "Producto actualizado" : "Producto creado");
      onClose();
    },
    onError: reportError,
  });

  const canSave = sku && name && categoryId && retailPrice >= 0 && wholesalePrice >= 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Especificaciones</Label>
            <Input
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            <SupplierPicker value={supplierId} onChange={(id) => setSupplierId(id)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio detal (USD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio mayor (USD)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Costo (USD, opcional)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Stock seguro (mínimo)</Label>
            <Input
              type="number"
              min={0}
              value={minStockThreshold}
              onChange={(e) => setMinStockThreshold(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">URL de imagen</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="text-sm text-brand-navy">
              Producto activo (visible en el catálogo)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
