import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Search, Unlink } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { PaginationBar, usePagination } from "@/components/pagination";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, reportError } from "@/lib/api-client";
import {
  applySecondStoreRow,
  type SecondStoreProduct,
  useSecondStoreProducts,
} from "@/lib/second-store";
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

// The bridge sync keeps this catalog in the thousands of rows. The whole list
// arrives in one request (served from the snapshot, ~1 Firestore read), so
// paging through it costs nothing more.
const PAGE_SIZE = 50;

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

  const pagination = usePagination(filtered, PAGE_SIZE, search);
  const tableTop = useRef<HTMLDivElement>(null);
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

      <Card ref={tableTop} className="mt-4 overflow-hidden">
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
              {!isLoading && pagination.total === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No hay productos con ese filtro.
                  </td>
                </tr>
              )}
              {pagination.pageItems.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-t border-border hover:bg-brand-surface"
                  onClick={() => setEditing(p)}
                >
                  <td className="px-4 py-3 text-muted-foreground">{p.code || "—"}</td>
                  <td className="px-4 py-3 font-medium text-brand-navy">{p.name}</td>
                  <td className="px-4 py-3 text-right">{p.stock}</td>
                  <td className="px-4 py-3 text-right">{formatMoneyAdmin(p.retailPrice ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoneyAdmin(p.wholesalePrice ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.linkedProduct ? p.linkedProduct.name : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <PaginationBar
        className="mt-4"
        page={pagination.page}
        totalPages={pagination.totalPages}
        onChange={pagination.setPage}
        from={pagination.from}
        to={pagination.to}
        total={pagination.total}
        scrollAnchor={tableTop}
      />

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

  const dirty =
    name !== item.name ||
    code !== (item.code ?? "") ||
    stock !== item.stock ||
    retailPrice !== (item.retailPrice ?? 0) ||
    wholesalePrice !== (item.wholesalePrice ?? 0);

  const save = useMutation({
    // Only what was edited — sending every field would also overwrite
    // whatever the bridge sync changed while this dialog was open.
    mutationFn: () => {
      const changes: Partial<SecondStoreProduct> = {};
      if (name !== item.name) changes.name = name;
      // "" clears it — undefined would be dropped from the JSON body.
      if (code !== (item.code ?? "")) changes.code = code;
      if (stock !== item.stock) changes.stock = stock;
      if (retailPrice !== (item.retailPrice ?? 0)) changes.retailPrice = retailPrice;
      if (wholesalePrice !== (item.wholesalePrice ?? 0)) changes.wholesalePrice = wholesalePrice;
      return apiFetch<SecondStoreProduct>(`/second-store-products/${item.id}`, {
        method: "PATCH",
        body: changes,
      });
    },
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, saved);
      toast.success("Producto actualizado");
      onClose();
    },
    onError: reportError,
  });

  const unlink = useMutation({
    mutationFn: () =>
      apiFetch<SecondStoreProduct>(`/second-store-products/${item.id}/unlink`, {
        method: "POST",
      }),
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, { ...saved, linkedProductId: undefined }, null);
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
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Descripción</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Código</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Stock</Label>
              <Input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(Math.max(0, Number(e.target.value)))}
              />
            </Field>
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
              />
            </Field>
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
              />
            </Field>
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
