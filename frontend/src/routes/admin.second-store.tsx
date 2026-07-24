import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Loader2, Pencil, Plus, Search, Store, Trash2, Unlink } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/second-store")({
  head: () => ({
    meta: [
      { title: "Tienda secundaria · Admin Electron Plus" },
      {
        name: "description",
        content: "Vincula productos de tu otra tienda para ver el stock combinado.",
      },
    ],
  }),
  component: SecondStorePage,
});

interface LinkedProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

interface SecondStoreProduct {
  id: string;
  name: string;
  code?: string;
  stock: number;
  price?: number;
  notes?: string;
  linkedProductId?: string;
  linkedProduct: LinkedProduct | null;
}

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useSecondStoreProducts() {
  return useQuery({
    queryKey: ["admin", "second-store-products"],
    queryFn: () => apiFetch<SecondStoreProduct[]>("/second-store-products"),
  });
}

function useAdminProductSearch(search: string) {
  return useQuery({
    queryKey: ["admin", "products", "second-store-picker", search],
    queryFn: () =>
      apiFetch<AdminProduct[]>(
        `/products/admin${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

function SecondStorePage() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SecondStoreProduct | null>(null);
  const [linking, setLinking] = useState<SecondStoreProduct | null>(null);
  const { data: items, isLoading } = useSecondStoreProducts();

  return (
    <AdminShell title="Tienda secundaria">
      <Card className="flex items-start gap-3 border-brand-blue/20 bg-brand-blue/5 p-4">
        <Store className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
        <div className="text-sm text-brand-navy">
          <p className="font-semibold">Control de stock entre dos tiendas</p>
          <p className="mt-1 text-muted-foreground">
            Electron Plus es el sistema principal: su stock vendrá de Profit mediante una
            integración automática que se activará más adelante. La tienda secundaria maneja su
            propio catálogo por separado, con nombres de producto distintos, así que aquí puedes
            registrar sus productos y vincularlos manualmente con los de Electron Plus para ver el
            stock de ambas tiendas lado a lado. Cuando la tienda secundaria también tenga una
            integración automática, sus cantidades se actualizarán aquí sin cambiar los vínculos ya
            creados.
          </p>
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-brand-navy">
          Productos de la tienda secundaria
        </h3>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      )}

      {!isLoading && (items?.length ?? 0) === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          Todavía no has registrado productos de la tienda secundaria.
        </Card>
      )}

      {(items?.length ?? 0) > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-surface">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Producto (tienda secundaria)</th>
                  <th className="px-4 py-2 text-right">Stock secundaria</th>
                  <th className="px-4 py-2">Vinculado a (Electron Plus)</th>
                  <th className="px-4 py-2 text-right">Stock principal</th>
                  <th className="px-4 py-2 text-right">Stock total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items?.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-navy">{item.name}</div>
                      {item.code && (
                        <div className="text-xs text-muted-foreground">{item.code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{item.stock}</td>
                    <td className="px-4 py-3">
                      {item.linkedProduct ? (
                        <div>
                          <div className="font-medium text-brand-navy">
                            {item.linkedProduct.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.linkedProduct.sku}
                          </div>
                        </div>
                      ) : (
                        <Badge className="border-transparent bg-brand-yellow/25 text-brand-navy">
                          Sin vincular
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {item.linkedProduct ? item.linkedProduct.stock : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-navy">
                      {item.linkedProduct ? item.linkedProduct.stock + item.stock : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={item.linkedProduct ? "Cambiar vínculo" : "Vincular"}
                          onClick={() => setLinking(item)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar"
                          onClick={() => setEditing(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteButton item={item} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <ProductFormDialog onClose={() => setCreating(false)} />}
      {editing && <ProductFormDialog item={editing} onClose={() => setEditing(null)} />}
      {linking && <LinkDialog item={linking} onClose={() => setLinking(null)} />}
    </AdminShell>
  );
}

function DeleteButton({ item }: { item: SecondStoreProduct }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => apiFetch(`/second-store-products/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });
      toast.success("Producto eliminado");
    },
    onError: reportError,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Eliminar" className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar "{item.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Esto quita el producto de la tienda secundaria y su vínculo, si tenía uno. No afecta el
            producto en Electron Plus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => remove.mutate()}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProductFormDialog({ item, onClose }: { item?: SecondStoreProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [stock, setStock] = useState(item?.stock ?? 0);
  const [price, setPrice] = useState(item?.price ?? 0);
  const [notes, setNotes] = useState(item?.notes ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        code: code || undefined,
        stock,
        price: price || undefined,
        notes: notes || undefined,
      };
      return item
        ? apiFetch(`/second-store-products/${item.id}`, { method: "PATCH", body })
        : apiFetch("/second-store-products", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });
      toast.success(item ? "Producto actualizado" : "Producto creado");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar producto" : "Nuevo producto de tienda secundaria"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Nombre (como está en la otra tienda)
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Código (opcional)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Stock</Label>
              <Input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Precio (opcional)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!name || save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ item, onClose }: { item: SecondStoreProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useAdminProductSearch(search);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });
  };

  const link = useMutation({
    mutationFn: (productId: string) =>
      apiFetch(`/second-store-products/${item.id}/link`, { method: "POST", body: { productId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Producto vinculado");
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
          <DialogTitle>Vincular "{item.name}"</DialogTitle>
        </DialogHeader>

        {item.linkedProduct && (
          <div className="flex items-center justify-between rounded-md border border-border bg-brand-surface p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Vinculado actualmente a</div>
              <div className="font-semibold text-brand-navy">{item.linkedProduct.name}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              <Unlink className="h-3.5 w-3.5" /> Desvincular
            </Button>
          </div>
        )}

        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto de Electron Plus…"
            className="pl-8"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {!isLoading && (products?.length ?? 0) === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No hay productos con este filtro.
            </div>
          )}
          {products?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => link.mutate(p.id)}
              disabled={link.isPending}
              className="flex w-full items-center justify-between rounded-md border border-border p-2 text-left text-sm hover:bg-brand-surface disabled:opacity-50"
            >
              <div>
                <div className="font-medium text-brand-navy">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.sku}</div>
              </div>
              <div className="text-xs text-muted-foreground">Stock: {p.stock}</div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
