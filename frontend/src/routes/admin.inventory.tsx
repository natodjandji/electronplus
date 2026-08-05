import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  ImageIcon,
  Link2,
  PackageX,
  Plus,
  Search,
  Trash2,
  Unlink,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { ProductImage } from "@/components/product-image";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { uploadProductImage } from "@/lib/image-compress";
import { formatMoneyAdmin } from "@/lib/electron-store";
import { toast } from "sonner";
import { slugify, stripDiacritics } from "@/lib/text";
import { useCategories, type Category } from "@/lib/categories";

export const Route = createFileRoute("/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario · Admin Electron Plus" },
      { name: "description", content: "Carga y administra los productos del catálogo." },
    ],
  }),
  component: InventoryPage,
});

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
  thumbnailUrl?: string;
  active: boolean;
}

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

// search="" shares its queryKey/cache with admin.index.tsx, admin.stock.tsx,
// and admin.suppliers.tsx's unfiltered GET /products/admin.
function useAdminProducts(search: string) {
  return useQuery({
    queryKey: ["admin", "products", search],
    queryFn: () =>
      apiFetch<AdminProduct[]>(
        `/products/admin${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

function useSecondStoreProducts() {
  return useQuery({
    queryKey: ["admin", "second-store-products"],
    queryFn: () => apiFetch<SecondStoreProduct[]>("/second-store-products"),
  });
}

function InventoryPage() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [linkingProduct, setLinkingProduct] = useState<AdminProduct | null>(null);
  const { data: products, isLoading } = useAdminProducts(search);
  const { data: suppliers } = useSuppliers();
  const { data: secondStoreProducts } = useSecondStoreProducts();
  const queryClient = useQueryClient();

  const supplierName = (id?: string) => suppliers?.find((s) => s.id === id)?.name;
  const secondStoreLink = (productId: string) =>
    secondStoreProducts?.find((s) => s.linkedProduct?.id === productId) ?? null;

  const deleteProduct = useMutation({
    mutationFn: (id: string) => apiFetch(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success("Producto eliminado");
    },
    onError: reportError,
  });

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
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Stock seguro</th>
                <th className="px-4 py-2 text-right">Tienda secundaria</th>
                <th className="px-4 py-2 text-right">Detal</th>
                <th className="px-4 py-2 text-right">Mayor</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableRowsSkeleton columns={9} />}
              {!isLoading && (products?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    No hay productos con este filtro.
                  </td>
                </tr>
              )}
              {products?.map((p) => {
                const low = (p.minStockThreshold ?? 0) > 0 && p.stock <= p.minStockThreshold!;
                const link = secondStoreLink(p.id);
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-border hover:bg-brand-surface"
                    onClick={() => setEditing(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          src={p.thumbnailUrl ?? p.imageUrl}
                          alt={p.name}
                          className="h-10 w-10 shrink-0 rounded-md border border-border"
                          iconClassName="h-4 w-4"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-brand-navy">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.sku} · {p.category.label}
                          </div>
                        </div>
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {link ? (
                          <div className="text-right">
                            <div className="font-medium text-brand-navy">{link.stock}</div>
                            <div className="text-[10px] text-muted-foreground">
                              total {p.stock + link.stock}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title={link ? "Gestionar vínculo" : "Vincular con tienda secundaria"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkingProduct(p);
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoneyAdmin(p.retailPrice)}</td>
                    <td className="px-4 py-3 text-right">{formatMoneyAdmin(p.wholesalePrice)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {p.stock === 0 && (
                          <Badge className="gap-1 bg-destructive text-white">
                            <PackageX className="h-3 w-3" /> Agotado
                          </Badge>
                        )}
                        {low && p.stock > 0 && (
                          <Badge className="gap-1 bg-brand-yellow text-brand-navy">
                            <AlertTriangle className="h-3 w-3" /> Bajo
                          </Badge>
                        )}
                        {!p.active && (
                          <Badge className="bg-muted text-muted-foreground">Inactivo</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            aria-label="Eliminar producto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar este producto?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción no se puede deshacer. Se eliminará "{p.name}" ({p.sku})
                              del inventario permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteProduct.mutate(p.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
      {linkingProduct && (
        <SecondStoreLinkDialog
          product={linkingProduct}
          link={secondStoreLink(linkingProduct.id)}
          onClose={() => setLinkingProduct(null)}
        />
      )}
    </AdminShell>
  );
}

function SecondStoreLinkDialog({
  product,
  link,
  onClose,
}: {
  product: AdminProduct;
  link: SecondStoreProduct | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newStock, setNewStock] = useState(0);
  const [newRetailPrice, setNewRetailPrice] = useState(0);
  const [newWholesalePrice, setNewWholesalePrice] = useState(0);
  const [codeEdit, setCodeEdit] = useState(link?.code ?? "");
  const [stockEdit, setStockEdit] = useState(link?.stock ?? 0);
  const [retailPriceEdit, setRetailPriceEdit] = useState(link?.retailPrice ?? 0);
  const [wholesalePriceEdit, setWholesalePriceEdit] = useState(link?.wholesalePrice ?? 0);
  const { data: allSecondStore } = useSecondStoreProducts();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "second-store-products"] });
  };

  const unlinked = (allSecondStore ?? [])
    .filter((s) => !s.linkedProduct)
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  const linkExisting = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/second-store-products/${id}/link`, {
        method: "POST",
        body: { productId: product.id },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Producto vinculado");
      onClose();
    },
    onError: reportError,
  });

  const createAndLink = useMutation({
    mutationFn: () =>
      apiFetch("/second-store-products", {
        method: "POST",
        body: {
          name: newName,
          code: newCode || undefined,
          stock: newStock,
          retailPrice: newRetailPrice || undefined,
          wholesalePrice: newWholesalePrice || undefined,
          linkedProductId: product.id,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Producto de tienda secundaria creado y vinculado");
      onClose();
    },
    onError: reportError,
  });

  const saveLink = useMutation({
    mutationFn: () =>
      apiFetch(`/second-store-products/${link!.id}`, {
        method: "PATCH",
        body: {
          code: codeEdit || undefined,
          stock: stockEdit,
          retailPrice: retailPriceEdit,
          wholesalePrice: wholesalePriceEdit,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Producto actualizado");
    },
    onError: reportError,
  });

  const unlink = useMutation({
    mutationFn: () => apiFetch(`/second-store-products/${link!.id}/unlink`, { method: "POST" }),
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
          <DialogTitle>Tienda secundaria · {product.name}</DialogTitle>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-border bg-brand-surface p-3 text-sm">
              <div className="font-semibold text-brand-navy">{link.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Código</Label>
                <Input value={codeEdit} onChange={(e) => setCodeEdit(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={stockEdit}
                  onChange={(e) => setStockEdit(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={retailPriceEdit}
                  onChange={(e) => setRetailPriceEdit(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={wholesalePriceEdit}
                  onChange={(e) => setWholesalePriceEdit(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={
                (codeEdit === (link.code ?? "") &&
                  stockEdit === link.stock &&
                  retailPriceEdit === (link.retailPrice ?? 0) &&
                  wholesalePriceEdit === (link.wholesalePrice ?? 0)) ||
                saveLink.isPending
              }
              onClick={() => saveLink.mutate()}
            >
              Guardar cambios
            </Button>
            <p className="text-xs text-muted-foreground">
              Stock combinado: {product.stock} (principal) + {link.stock} (secundaria) ={" "}
              <b>{product.stock + link.stock}</b>
            </p>
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              <Unlink className="h-3.5 w-3.5" /> Desvincular
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto de tienda secundaria…"
                className="pl-8"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {unlinked.length === 0 && !creatingNew && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No hay productos sin vincular con ese nombre.
                </div>
              )}
              {unlinked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => linkExisting.mutate(s.id)}
                  disabled={linkExisting.isPending}
                  className="flex w-full items-center justify-between rounded-md border border-border p-2 text-left text-sm hover:bg-brand-surface disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-brand-navy">{s.name}</div>
                    {s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground">Stock: {s.stock}</div>
                </button>
              ))}
            </div>

            {!creatingNew ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setCreatingNew(true);
                  setNewName(product.name);
                }}
              >
                <Plus className="h-4 w-4" /> Crear producto de tienda secundaria
              </Button>
            ) : (
              <div className="grid gap-2 rounded-md border border-border p-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-brand-navy">
                    Nombre (como está en la otra tienda)
                  </Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Código (opcional)</Label>
                    <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Stock</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newStock}
                      onChange={(e) => setNewStock(Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newRetailPrice}
                      onChange={(e) => setNewRetailPrice(Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newWholesalePrice}
                      onChange={(e) => setNewWholesalePrice(Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="bg-brand-blue text-white hover:bg-brand-blue/90"
                  disabled={!newName || createAndLink.isPending}
                  onClick={() => createAndLink.mutate()}
                >
                  Crear y vincular
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [thumbnailUrl, setThumbnailUrl] = useState(product?.thumbnailUrl ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [stockTarget, setStockTarget] = useState(product?.stock ?? 0);
  const [imageUploading, setImageUploading] = useState(false);

  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageUploading(true);
    try {
      const { url, thumbnailUrl: thumb } = await uploadProductImage(file);
      setImageUrl(url);
      setThumbnailUrl(thumb);
    } catch {
      toast.error("No se pudo subir la imagen");
    } finally {
      setImageUploading(false);
    }
  };

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
        imageUrl,
        thumbnailUrl,
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

  const adjustStock = useMutation({
    mutationFn: () =>
      apiFetch(`/products/${product!.id}/stock`, {
        method: "PATCH",
        body: { delta: stockTarget - product!.stock },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success("Stock actualizado");
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
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <div className="flex min-w-0 gap-2">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="min-w-0 flex-1">
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setCreatingCategory(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            <SupplierPicker value={supplierId} onChange={(id) => setSupplierId(id)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio detal ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio mayor ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Costo ($, opcional)</Label>
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
          {isEdit && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-brand-navy">
                Stock real (unidades en existencia)
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  value={stockTarget}
                  onChange={(e) => setStockTarget(Math.max(0, Number(e.target.value)))}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={stockTarget === product!.stock || adjustStock.isPending}
                  onClick={() => adjustStock.mutate()}
                >
                  Actualizar stock
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stock actualmente registrado: {product!.stock} uds.
              </p>
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Imagen del producto</Label>
            <div className="flex items-center gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-brand-surface">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-2 text-sm text-muted-foreground hover:border-brand-blue/40">
                  <ImageIcon className="h-4 w-4" />
                  {imageUploading ? "Subiendo…" : "Subir imagen"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={imageUploading}
                    onChange={handleImageSelect}
                  />
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl("");
                      setThumbnailUrl("");
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Quitar imagen
                  </button>
                )}
              </div>
            </div>
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

      {creatingCategory && (
        <CreateCategoryDialog
          onClose={() => setCreatingCategory(false)}
          onCreated={(category) => {
            setCategoryId(category.id);
            setCreatingCategory(false);
          }}
        />
      )}
    </Dialog>
  );
}

/** Strips combining diacritical marks (U+0300–U+036F) left behind by NFD normalization. */

function CreateCategoryDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (category: Category) => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: { code: slugify(label), label },
      }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoría creada");
      onCreated(category);
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. Iluminación"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!label.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Crear categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
