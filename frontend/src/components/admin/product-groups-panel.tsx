import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/pagination";
import { QuantityStepper } from "@/components/quantity-stepper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, reportError } from "@/lib/api-client";
import {
  ADMIN_PRODUCT_GROUPS_KEY,
  GROUP_LABELS_KEY,
  MAX_GROUP_LABELS,
  MAX_GROUP_PRODUCTS,
  MIN_GROUP_PRODUCTS,
  type GroupQrLabel,
  type ProductGroup,
} from "@/lib/product-groups";
import { matchesWords } from "@/lib/product-search";

interface GroupProduct {
  id: string;
  name: string;
  sku: string;
  model?: string | null;
  active: boolean;
}

export function ProductGroupsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProductGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductGroup | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [readyImages, setReadyImages] = useState<Record<string, string>>({});
  const [imageFailed, setImageFailed] = useState(false);
  const groupsQuery = useQuery({
    queryKey: ADMIN_PRODUCT_GROUPS_KEY,
    queryFn: () => apiFetch<ProductGroup[]>("/product-groups"),
  });
  const groups = groupsQuery.data ?? [];
  const visible = groups.filter((g) => matchesWords(search, g.name, g.id));
  const page = usePagination(visible, 15, search);
  // Keep all selected groups when filtering/paging the list.
  const selectedIds = groups
    .filter((g) => (quantities[g.id] ?? 0) > 0)
    .map((g) => g.id)
    .sort();
  const labels = useQuery({
    queryKey: [...GROUP_LABELS_KEY, selectedIds],
    queryFn: () =>
      apiFetch<GroupQrLabel[]>("/qr/group-labels", {
        method: "POST",
        body: { groupIds: selectedIds },
      }),
    enabled: selectedIds.length > 0,
  });
  const totalLabels = selectedIds.reduce((total, id) => total + quantities[id], 0);
  const canPrint =
    selectedIds.length > 0 &&
    !groupsQuery.isFetching &&
    !groupsQuery.isError &&
    labels.isSuccess &&
    !labels.isFetching &&
    !imageFailed &&
    selectedIds.every((id) => {
      const label = labels.data.find((l) => l.groupId === id);
      return label && readyImages[id] === label.qrImageDataUrl;
    });

  const refreshGroups = async (id: string, deleted = false) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCT_GROUPS_KEY }),
      // The previous selection can still be observed until React commits
      // the removal; do not request fresh labels for an already deleted id.
      queryClient.invalidateQueries({
        queryKey: GROUP_LABELS_KEY,
        refetchType: deleted ? "none" : "active",
      }),
      queryClient.invalidateQueries({ queryKey: ["product-groups", id] }),
    ]);
  };
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/product-groups/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setQuantities((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setDeleting(null);
      await refreshGroups(id, true);
      toast.success("Grupo eliminado");
    },
    onError: reportError,
  });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)] print:contents">
      <Card className="min-w-0 p-4 sm:p-6 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-brand-navy">Grupos de productos</h2>
          <Button
            size="sm"
            className="gap-1.5 bg-brand-blue text-white hover:bg-brand-blue/90"
            onClick={() => setEditing("new")}
          >
            <Plus className="h-4 w-4" /> Nuevo grupo
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reúne manualmente las variaciones de un producto bajo una misma etiqueta.
        </p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupo…"
            aria-label="Buscar grupo"
            className="pl-8"
          />
        </div>
        {groupsQuery.isPending ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando grupos…
          </p>
        ) : groupsQuery.isError ? (
          <div className="py-6 text-center text-sm" role="alert">
            <p>No pudimos cargar los grupos.</p>
            <Button variant="outline" className="mt-2" onClick={() => void groupsQuery.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {groups.length
              ? "No hay grupos con esa búsqueda."
              : "Crea tu primer grupo para imprimir una etiqueta compartida."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {page.pageItems.map((group) => (
              <li key={group.id} className="rounded-md border border-border p-3">
                <div className="break-words text-sm font-semibold text-brand-navy">
                  {group.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {group.productIds.length} productos · {group.id}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setEditing(group)}
                    aria-label={`Editar ${group.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label={`Eliminar ${group.name}`}
                    onClick={() => setDeleting(group)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link
                      to="/grupo/$code"
                      params={{ code: group.id }}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Ver ${group.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <div className="ml-auto" aria-label={`Etiquetas de ${group.name}`}>
                    <QuantityStepper
                      qty={quantities[group.id] ?? 0}
                      showIcon={false}
                      addLabel="Etiquetas"
                      size="sm"
                      disabled={!quantities[group.id] && selectedIds.length >= MAX_GROUP_LABELS}
                      onChange={(qty) => {
                        setImageFailed(false);
                        setQuantities((current) => ({ ...current, [group.id]: qty }));
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <PaginationBar
          className="mt-3"
          page={page.page}
          totalPages={page.totalPages}
          onChange={page.setPage}
          from={page.from}
          to={page.to}
          total={page.total}
        />
        {selectedIds.length > 0 && (
          <Button variant="link" size="sm" className="mt-2 p-0" onClick={() => setQuantities({})}>
            Limpiar selección
          </Button>
        )}
        {selectedIds.length >= MAX_GROUP_LABELS && (
          <p className="mt-2 text-xs text-muted-foreground">
            Puedes imprimir hasta {MAX_GROUP_LABELS} grupos diferentes por lote.
          </p>
        )}
      </Card>

      <div className="min-w-0 print:contents">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h2 className="font-semibold text-brand-navy">Vista previa · {totalLabels} etiquetas</h2>
          <Button
            className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!canPrint}
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" /> Imprimir grupos
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Etiquetas de 5×3 cm. Solo el QR y el nombre del grupo; los productos y precios se
            consultan al escanear.
          </p>
        </div>
        {selectedIds.length === 0 ? (
          <Card className="mt-4 p-8 text-center text-sm text-muted-foreground print:hidden">
            Elige cuántas etiquetas necesitas de cada grupo.
          </Card>
        ) : labels.isError || imageFailed ? (
          <div
            className="mt-4 rounded-md border border-destructive/30 p-6 text-center text-sm print:hidden"
            role="alert"
          >
            <p>No pudimos preparar las etiquetas. Vuelve a intentarlo antes de imprimir.</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => {
                setImageFailed(false);
                void labels.refetch();
              }}
            >
              Reintentar etiquetas
            </Button>
          </div>
        ) : labels.isFetching ? (
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground print:hidden">
            <Loader2 className="h-4 w-4 animate-spin" /> Generando etiquetas…
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap justify-center gap-3 print:mt-0 print:block">
            {labels.data?.flatMap((label) =>
              Array.from({ length: quantities[label.groupId] ?? 0 }, (_, index) => (
                <div
                  key={`${label.groupId}-${index}-${labels.dataUpdatedAt}`}
                  className="qr-label flex items-center gap-1.5 overflow-hidden border border-dashed border-brand-blue/30 bg-white p-1 print:border-none"
                >
                  <img
                    src={label.qrImageDataUrl}
                    alt=""
                    className="h-[22mm] w-[22mm] shrink-0 object-contain"
                    onLoad={() =>
                      setReadyImages((current) =>
                        current[label.groupId] === label.qrImageDataUrl
                          ? current
                          : { ...current, [label.groupId]: label.qrImageDataUrl },
                      )
                    }
                    onError={() => setImageFailed(true)}
                  />
                  <div
                    className={`min-w-0 break-words font-bold leading-tight text-black [overflow-wrap:anywhere] ${label.name.length > 50 ? "text-[9px]" : "text-[11px]"}`}
                  >
                    {label.name}
                  </div>
                </div>
              )),
            )}
          </div>
        )}
      </div>

      {editing && (
        <GroupEditorDialog
          key={editing === "new" ? "new" : editing.id}
          group={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={refreshGroups}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}
      >
        <AlertDialogContent className="print:hidden">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Las etiquetas impresas de este grupo dejarán de abrir su lista. Sus productos
              permanecerán en el catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              Eliminar grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GroupEditorDialog({
  group,
  onClose,
  onSaved,
}: {
  group?: ProductGroup;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [productIds, setProductIds] = useState(group?.productIds ?? []);
  const [search, setSearch] = useState("");
  const productsQuery = useQuery({
    // Reuse the inventory/labels cache, not one product request per selection.
    queryKey: ["admin", "products", ""],
    queryFn: () => apiFetch<GroupProduct[]>("/products/admin"),
  });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const matches = useMemo(
    () => products.filter((p) => matchesWords(search, p.name, p.model, p.sku)),
    [products, search],
  );
  const page = usePagination(matches, 15, search);
  const missing = productIds.some((id) => !byId.has(id));
  const valid =
    name.trim().length > 0 &&
    name.length <= 80 &&
    productIds.length >= MIN_GROUP_PRODUCTS &&
    productIds.length <= MAX_GROUP_PRODUCTS &&
    productsQuery.isSuccess &&
    !missing;
  const save = useMutation({
    mutationFn: () =>
      apiFetch<ProductGroup>(
        group ? `/product-groups/${encodeURIComponent(group.id)}` : "/product-groups",
        { method: group ? "PATCH" : "POST", body: { name: name.trim(), productIds } },
      ),
    onSuccess: async (saved) => {
      await onSaved(saved.id);
      toast.success(group ? "Grupo actualizado; conserva el mismo QR" : "Grupo creado");
      onClose();
    },
    onError: reportError,
  });
  const move = (index: number, offset: number) =>
    setProductIds((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col overflow-hidden print:hidden">
        <DialogHeader>
          <DialogTitle>{group ? "Editar grupo" : "Nuevo grupo"}</DialogTitle>
          <DialogDescription>
            Selecciona de {MIN_GROUP_PRODUCTS} a {MAX_GROUP_PRODUCTS} productos y el orden en que
            aparecerán al escanear. {group && "El código QR se conserva al editar."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !save.isPending) save.mutate();
          }}
        >
          <div className="grid shrink-0 gap-1.5">
            <Label htmlFor="group-name">Nombre del grupo</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ej. Panel LED Borde Infinito"
              disabled={save.isPending}
              required
            />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="group-product-search">Productos del catálogo</Label>
              <Input
                id="group-product-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, SKU o código de barra…"
                className="mb-2 mt-2"
              />
              {productsQuery.isPending ? (
                <p className="p-4 text-sm text-muted-foreground">Cargando catálogo…</p>
              ) : productsQuery.isError ? (
                <div className="p-4 text-sm" role="alert">
                  <p>No pudimos cargar el catálogo.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={() => void productsQuery.refetch()}
                  >
                    Reintentar catálogo
                  </Button>
                </div>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border border-border">
                  {page.pageItems.map((product) => {
                    const selected = productIds.includes(product.id);
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${selected ? "Seleccionado" : "Seleccionar"} ${product.name}`}
                          disabled={
                            selected || productIds.length >= MAX_GROUP_PRODUCTS || save.isPending
                          }
                          onClick={() =>
                            setProductIds((ids) =>
                              ids.includes(product.id) || ids.length >= MAX_GROUP_PRODUCTS
                                ? ids
                                : [...ids, product.id],
                            )
                          }
                          className="flex w-full items-center gap-2 p-3 text-left text-sm hover:bg-brand-surface disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium text-brand-navy">
                              {product.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {product.model}
                              {product.active === false && " · Oculto en el catálogo público"}
                            </span>
                          </span>
                          {selected ? (
                            <Check className="h-4 w-4 shrink-0 text-brand-blue" />
                          ) : (
                            <Plus className="h-4 w-4 shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {matches.length === 0 && (
                    <li className="p-4 text-center text-sm text-muted-foreground">
                      Sin productos con esa búsqueda.
                    </li>
                  )}
                </ul>
              )}
              <PaginationBar
                className="mt-2"
                page={page.page}
                totalPages={page.totalPages}
                onChange={page.setPage}
                from={page.from}
                to={page.to}
                total={page.total}
              />
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-medium">
                Seleccionados · {productIds.length}/{MAX_GROUP_PRODUCTS}
              </h3>
              {productIds.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Agrega las variaciones desde el catálogo.
                </p>
              ) : (
                <ol className="max-h-80 divide-y overflow-y-auto rounded-md border border-border">
                  {productIds.map((id, index) => {
                    const product = byId.get(id);
                    return (
                      <li key={id} className="flex items-start gap-2 p-2.5">
                        <span className="mt-1 text-xs text-muted-foreground">{index + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-medium text-brand-navy">
                            {product?.name ?? id}
                          </div>
                          {product?.model && (
                            <div className="text-xs text-muted-foreground">SKU {product.model}</div>
                          )}
                          {!product && productsQuery.isSuccess && (
                            <p className="text-xs text-destructive">
                              Producto eliminado: quítalo del grupo para guardar.
                            </p>
                          )}
                          <div className="mt-1 flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Subir ${product?.name ?? id}`}
                              disabled={index === 0 || save.isPending}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Bajar ${product?.name ?? id}`}
                              disabled={index === productIds.length - 1 || save.isPending}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              aria-label={`Quitar ${product?.name ?? id}`}
                              disabled={save.isPending}
                              onClick={() =>
                                setProductIds((ids) => ids.filter((pid) => pid !== id))
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              disabled={!valid || save.isPending}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {group ? "Guardar grupo" : "Crear grupo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
