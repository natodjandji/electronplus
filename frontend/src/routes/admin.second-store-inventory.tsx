import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Unlink } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, reportError } from "@/lib/api-client";
import { formatMoneyAdmin } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/second-store-inventory")({
  head: () => ({
    meta: [
      { title: "Tienda secundaria · Admin Electron Plus" },
      {
        name: "description",
        content: "Catálogo sincronizado con el Profit Plus de la tienda secundaria.",
      },
    ],
  }),
  component: SecondStoreInventoryPage,
});

interface SecondStoreProduct {
  id: string;
  name: string;
  code?: string;
  stock: number;
  retailPrice?: number;
  wholesalePrice?: number;
  linkedProductId?: string;
  linkedProduct: { id: string; sku: string; name: string; stock: number } | null;
}

// Shares its queryKey/cache with the "Tienda secundaria" link dialog in
// admin.inventory.tsx — same GET /second-store-products, one fetch either
// page loads first primes the other.
function useSecondStoreProducts() {
  return useQuery({
    queryKey: ["admin", "second-store-products"],
    queryFn: () => apiFetch<SecondStoreProduct[]>("/second-store-products"),
  });
}

// The bridge sync keeps this catalog in the thousands of rows — rendering
// all of them unfiltered would mean thousands of <tr> with no virtualization
// library in this project. Capping the rendered list keeps the DOM light;
// searching narrows it down to something worth scrolling through.
const MAX_RENDERED_ROWS = 200;

function SecondStoreInventoryPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SecondStoreProduct | null>(null);
  const { data: items, isLoading } = useSecondStoreProducts();

  const filtered = useMemo(() => {
    const all = items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const visible = filtered.slice(0, MAX_RENDERED_ROWS);
  const total = items?.length ?? 0;
  const linkedCount = items?.filter((p) => p.linkedProduct).length ?? 0;

  return (
    <AdminShell title="Tienda secundaria">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="pl-8"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {total} producto{total === 1 ? "" : "s"} · {linkedCount} vinculado
            {linkedCount === 1 ? "" : "s"} al catálogo principal
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Descripción</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Detal</th>
                <th className="px-4 py-2 text-right">Mayor</th>
                <th className="px-4 py-2">Vinculado a</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableRowsSkeleton columns={6} />}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No hay productos con ese filtro.
                  </td>
                </tr>
              )}
              {visible.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-t border-border hover:bg-brand-surface"
                  onClick={() => setEditing(p)}
                >
                  <td className="px-4 py-3 text-muted-foreground">{p.code || "—"}</td>
                  <td className="px-4 py-3 font-medium text-brand-navy">{p.name}</td>
                  <td className="px-4 py-3 text-right">{p.stock}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyAdmin(p.retailPrice ?? 0)}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyAdmin(p.wholesalePrice ?? 0)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.linkedProduct ? p.linkedProduct.name : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > MAX_RENDERED_ROWS && (
          <div className="border-t border-border bg-brand-surface px-4 py-2 text-xs text-muted-foreground">
            Mostrando {MAX_RENDERED_ROWS} de {filtered.length} resultados — refina la búsqueda para
            ver otros.
          </div>
        )}
      </Card>

      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} />}
    </AdminShell>
  );
}

function EditDialog({ item, onClose }: { item: SecondStoreProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name);
  const [code, setCode] = useState(item.code ?? "");
  const [stock, setStock] = useState(item.stock);
  const [retailPrice, setRetailPrice] = useState(item.retailPrice ?? 0);
  const [wholesalePrice, setWholesalePrice] = useState(item.wholesalePrice ?? 0);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });

  const dirty =
    name !== item.name ||
    code !== (item.code ?? "") ||
    stock !== item.stock ||
    retailPrice !== (item.retailPrice ?? 0) ||
    wholesalePrice !== (item.wholesalePrice ?? 0);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/second-store-products/${item.id}`, {
        method: "PATCH",
        body: { name, code: code || undefined, stock, retailPrice, wholesalePrice },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Producto actualizado");
      onClose();
    },
    onError: reportError,
  });

  const unlink = useMutation({
    mutationFn: () => apiFetch(`/second-store-products/${item.id}/unlink`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast.success("Vínculo eliminado");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar producto de tienda secundaria</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Descripción</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Código</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Stock</Label>
              <Input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
              />
            </div>
          </div>
          {item.linkedProduct && (
            <p className="text-xs text-muted-foreground">
              Vinculado a <b>{item.linkedProduct.name}</b> del catálogo principal.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {item.linkedProduct ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              <Unlink className="h-3.5 w-3.5" /> Desvincular
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              className="bg-brand-blue text-white hover:bg-brand-blue/90"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              Guardar cambios
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
