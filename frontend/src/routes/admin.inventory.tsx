import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  ImageIcon,
  Link2,
  ListFilter,
  PackageX,
  Plus,
  Search,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { PaginationBar, usePagination } from "@/components/pagination";
import { PendingToggle } from "@/components/pending-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SupplierPicker, useSuppliers } from "@/components/supplier-picker";
import { apiFetch, reportError } from "@/lib/api-client";
import {
  applySecondStoreRow,
  comparePrices,
  isFromSecondStoreErp,
  rankLinkCandidates,
  SECOND_STORE_ERP_NOTE,
  type SecondStoreProduct,
  useSecondStoreProducts,
} from "@/lib/second-store";
import {
  ANY,
  facetCounts,
  hasFilters,
  matchesFilters,
  NO_FILTERS,
  NO_SUPPLIER,
  type InventoryFilters,
  type InventoryRow,
  type PriceFilter,
} from "@/lib/inventory-filters";
import { fold } from "@/lib/product-search";
import { uploadProductImage } from "@/lib/image-compress";
import { formatMoneyAdmin } from "@/lib/electron-store";
import { toast } from "sonner";
import { slugify } from "@/lib/text";
import { cn } from "@/lib/utils";
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
  /** The barcode ("Código de barra"). */
  sku: string;
  /** The store's SKU: Profit Plus's Modelo field. */
  model?: string | null;
  name: string;
  specs?: string;
  /** From Profit Plus; its supplier is assigned by the sync. */
  brand?: string | null;
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
  /** Set when the Profit Plus sync hid it: Profit Plus stopped sending it. */
  erpRemovedAt?: string | null;
  /** Its code in Profit Plus, for products synced from there. */
  erpExternalId?: string;
}

// Shares its queryKey/cache with admin.index.tsx, admin.stock.tsx and
// admin.suppliers.tsx's GET /products/admin. Search filters this one list in
// the browser — it used to send a request per keystroke.
function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products", ""],
    queryFn: () => apiFetch<AdminProduct[]>("/products/admin"),
  });
}

const PAGE_SIZE = 25;
const LINK_PICKER_PAGE_SIZE = 20;

function InventoryPage() {
  const [filters, setFilters] = useState<InventoryFilters>(NO_FILTERS);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [linkingProduct, setLinkingProduct] = useState<AdminProduct | null>(null);
  const { data: allProducts, isLoading } = useAdminProducts();
  const { data: suppliers } = useSuppliers();
  const { data: secondStoreProducts } = useSecondStoreProducts();
  const queryClient = useQueryClient();

  const setFilter = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) =>
    setFilters((current) => {
      const next = { ...current, [key]: value };
      // Only linked products have prices to compare, so a price filter and
      // "Sin vincular" together would always come up empty: the newer wins.
      if ((key === "wholesale" || key === "retail") && value !== ANY) next.onlyUnlinked = false;
      if (key === "onlyUnlinked" && value) {
        next.wholesale = ANY;
        next.retail = ANY;
      }
      return next;
    });

  // One lookup per row instead of scanning the thousands of second-store
  // rows for each product on every render.
  const linkByProductId = useMemo(
    () =>
      new Map(
        (secondStoreProducts ?? []).flatMap((s) =>
          s.linkedProduct ? [[s.linkedProduct.id, s] as const] : [],
        ),
      ),
    [secondStoreProducts],
  );
  const secondStoreLink = (productId: string) => linkByProductId.get(productId) ?? null;
  // Unknown until the second store's list arrives: before that every
  // product would look unlinked.
  const unlinkedCount = secondStoreProducts
    ? (allProducts ?? []).filter((p) => !linkByProductId.has(p.id)).length
    : undefined;

  const rows = useMemo(
    () =>
      (allProducts ?? []).map((p): InventoryRow<AdminProduct> => {
        const link = linkByProductId.get(p.id);
        return {
          product: p,
          text: fold(`${p.name} ${p.model ?? ""} ${p.sku}`),
          categoryId: p.categoryId,
          supplierId: p.supplierId,
          linked: Boolean(link),
          wholesale: link ? comparePrices(p.wholesalePrice, link.wholesalePrice) : null,
          retail: link ? comparePrices(p.retailPrice, link.retailPrice) : null,
        };
      }),
    [allProducts, linkByProductId],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.product.id, r])), [rows]);
  const products = useMemo(
    () => rows.filter((r) => matchesFilters(r, filters)).map((r) => r.product),
    [rows, filters],
  );
  const pagination = usePagination(products, PAGE_SIZE, JSON.stringify(filters));
  const tableTop = useRef<HTMLDivElement>(null);

  const supplierName = (id?: string) => suppliers?.find((s) => s.id === id)?.name;

  // Each filter lists the values the catalog has, with what picking one
  // would leave given the other filters.
  const categoryCounts = facetCounts(rows, filters, "category");
  const categoryOptions = uniqueBy(
    rows.map((r) => ({ value: r.categoryId, label: r.product.category.label })),
  ).map((o) => ({ ...o, count: categoryCounts.get(o.value) ?? 0 }));
  const supplierCounts = facetCounts(rows, filters, "supplier");
  const supplierOptions = uniqueBy(
    rows.map((r) =>
      r.supplierId
        ? {
            value: r.supplierId,
            label: supplierName(r.supplierId) ?? "Proveedor desconocido",
          }
        : { value: NO_SUPPLIER, label: "Sin proveedor" },
    ),
  ).map((o) => ({ ...o, count: supplierCounts.get(o.value) ?? 0 }));
  // Unknown until the second store's list arrives.
  const priceCounts = (facet: "wholesale" | "retail") =>
    secondStoreProducts ? facetCounts(rows, filters, facet) : undefined;

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
        <Field className="grid gap-1.5">
          <Label htmlFor="inventory-search" className="text-xs font-medium text-brand-navy">
            Buscar
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="inventory-search"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Nombre, SKU o código de barra…"
              className="w-72 max-w-full pl-8"
            />
          </div>
        </Field>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <FilterSelect
          id="category-filter"
          label="Categoría"
          allLabel="Todas"
          value={filters.category}
          onChange={(value) => setFilter("category", value)}
          options={categoryOptions}
        />
        <FilterSelect
          id="supplier-filter"
          label="Proveedor"
          allLabel="Todos"
          value={filters.supplier}
          onChange={(value) => setFilter("supplier", value)}
          options={supplierOptions}
        />
        <PriceCheckMenu
          retail={filters.retail}
          wholesale={filters.wholesale}
          onChange={setFilter}
          retailCounts={priceCounts("retail")}
          wholesaleCounts={priceCounts("wholesale")}
        />
        {/* Products whose stock isn't linked to the second store yet. */}
        <PendingToggle
          label="Sin vincular"
          count={unlinkedCount}
          active={filters.onlyUnlinked}
          onToggle={() => setFilter("onlyUnlinked", !filters.onlyUnlinked)}
        />
        {hasFilters(filters) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground"
            onClick={() => setFilters(NO_FILTERS)}
          >
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </div>

      <Card ref={tableTop} className="mt-6 overflow-hidden">
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
              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    No hay productos con este filtro.
                  </td>
                </tr>
              )}
              {pagination.pageItems.map((p) => {
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
                            {p.model && <>{p.model} · </>}
                            {p.category.label}
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
                    <PriceCell
                      price={p.retailPrice}
                      secondPrice={link?.retailPrice}
                      mismatch={rowById.get(p.id)?.retail === "different"}
                      title="Precio al detal en la tienda secundaria"
                    />
                    <PriceCell
                      price={p.wholesalePrice}
                      secondPrice={link?.wholesalePrice}
                      mismatch={rowById.get(p.id)?.wholesale === "different"}
                      title="Precio al mayor en la tienda secundaria"
                    />
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
                        {!p.active &&
                          (p.erpRemovedAt ? (
                            <Badge className="bg-muted text-muted-foreground">
                              Ya no está en Profit
                            </Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground">Inactivo</Badge>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* One still in Profit Plus would come back with the
                          next sync: it's removed there, or deactivated here. */}
                      {(!p.erpExternalId || p.erpRemovedAt) && (
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
                                Esta acción no se puede deshacer. Se eliminará "{p.name}"
                                {p.model && ` (${p.model})`}
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
                      )}
                    </td>
                  </tr>
                );
              })}
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

/** The first of each value, sorted by label. */
function uniqueBy(options: { value: string; label: string }[]) {
  const byValue = new Map(options.map((o) => [o.value, o] as const));
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/**
 * One of the inventory's filters: a list of values, each with how many
 * products picking it would leave (left out while unknown), plus "all".
 */
function FilterSelect({
  id,
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <Field className="grid w-full gap-1.5 sm:w-auto">
      <Label htmlFor={id} className="text-xs font-medium text-brand-navy">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className={cn(
            "w-full gap-2 sm:w-56 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left",
            value !== ANY && "border-brand-blue bg-brand-blue/5",
          )}
        >
          <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ANY}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {o.count !== undefined && ` · ${o.count}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * The retail and wholesale price checks against the secundaria, in one
 * small button: each lists every linked product, only those whose price
 * agrees, or only those whose price doesn't. The menu stays open after a
 * pick, so both can be set in one go.
 */
function PriceCheckMenu({
  retail,
  wholesale,
  onChange,
  retailCounts,
  wholesaleCounts,
}: {
  retail: PriceFilter;
  wholesale: PriceFilter;
  onChange: (key: "retail" | "wholesale", value: PriceFilter) => void;
  /** Left out while the secundaria's list is loading. */
  retailCounts?: Map<string, number>;
  wholesaleCounts?: Map<string, number>;
}) {
  const active = [retail, wholesale].filter((v) => v !== ANY).length;
  const group = (
    key: "retail" | "wholesale",
    label: string,
    value: PriceFilter,
    counts?: Map<string, number>,
  ) => (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(next) => onChange(key, next as PriceFilter)}
      >
        {(
          [
            [ANY, "Todos"],
            ["same", "Mismo precio"],
            ["different", "Precio distinto"],
          ] as const
        ).map(([option, text]) => (
          <DropdownMenuRadioItem
            key={option}
            value={option}
            onSelect={(e) => e.preventDefault()}
            className="gap-3"
          >
            <span className="flex-1">{text}</span>
            {option !== ANY && counts && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {counts.get(option) ?? 0}
              </span>
            )}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Verificar precios entre tiendas"
          title="Verificar precios entre tiendas"
          className={cn(
            "h-9 gap-1.5",
            active > 0 && "border-brand-blue bg-brand-blue/5 text-brand-navy",
          )}
        >
          <CircleDollarSign className="h-4 w-4" />
          Precios
          {active > 0 && (
            <span className="rounded-full bg-brand-blue px-1.5 text-xs font-semibold tabular-nums text-white">
              {active}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {group("retail", "Precio al detal entre tiendas", retail, retailCounts)}
        <DropdownMenuSeparator />
        {group("wholesale", "Precio al mayor entre tiendas", wholesale, wholesaleCounts)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A price, with the secundaria's under it when the two disagree. */
function PriceCell({
  price,
  secondPrice,
  mismatch,
  title,
}: {
  price: number;
  secondPrice: number | undefined;
  mismatch: boolean;
  title: string;
}) {
  return (
    <td className="px-4 py-3 text-right">
      <div>{formatMoneyAdmin(price)}</div>
      {mismatch && (
        <div className="whitespace-nowrap text-[10px] font-medium text-amber-700" title={title}>
          secundaria {secondPrice ? formatMoneyAdmin(secondPrice) : "sin precio"}
        </div>
      )}
    </td>
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
  // Opens on the product's own SKU: the secundaria usually has it under the
  // same code, which then comes first.
  const initialSearch = product.model?.trim() || product.sku;
  const [search, setSearch] = useState(initialSearch);
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

  const asLink = { id: product.id, sku: product.sku, name: product.name, stock: product.stock };

  const unlinked = useMemo(
    () =>
      rankLinkCandidates(
        (allSecondStore ?? []).filter((s) => !s.linkedProduct),
        search,
        // Some are filed under the barcode instead: looked for too, until
        // the admin types a search of their own.
        search === initialSearch && product.sku !== initialSearch ? [product.sku] : [],
      ),
    [allSecondStore, search, initialSearch, product.sku],
  );
  const unlinkedPage = usePagination(unlinked, LINK_PICKER_PAGE_SIZE, search);

  const linkExisting = useMutation({
    mutationFn: (id: string) =>
      apiFetch<SecondStoreProduct>(`/second-store-products/${id}/link`, {
        method: "POST",
        body: { productId: product.id },
      }),
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, saved, asLink);
      toast.success("Producto vinculado");
      onClose();
    },
    onError: reportError,
  });

  const createAndLink = useMutation({
    mutationFn: () =>
      apiFetch<SecondStoreProduct>("/second-store-products", {
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
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, saved, asLink);
      toast.success("Producto de tienda secundaria creado y vinculado");
      onClose();
    },
    onError: reportError,
  });

  const saveLink = useMutation({
    mutationFn: () =>
      apiFetch<SecondStoreProduct>(`/second-store-products/${link!.id}`, {
        method: "PATCH",
        body: {
          code: codeEdit,
          stock: stockEdit,
          retailPrice: retailPriceEdit,
          wholesalePrice: wholesalePriceEdit,
        },
      }),
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, saved);
      toast.success("Producto actualizado");
    },
    onError: reportError,
  });

  const unlink = useMutation({
    mutationFn: () =>
      apiFetch<SecondStoreProduct>(`/second-store-products/${link!.id}/unlink`, {
        method: "POST",
      }),
    onSuccess: (saved) => {
      applySecondStoreRow(queryClient, { ...saved, linkedProductId: undefined }, null);
      toast.success("Vínculo eliminado");
      onClose();
    },
    onError: reportError,
  });

  // Profit's own fields can't be edited on a record it brought (see
  // isFromSecondStoreErp); a record made by hand still can.
  const linkFromErp = link ? isFromSecondStoreErp(link) : false;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tienda secundaria · {product.name}</DialogTitle>
          <DialogDescription>
            {product.model && <>SKU {product.model} · </>}
            Mayor {formatMoneyAdmin(product.wholesalePrice)}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-border bg-brand-surface p-3 text-sm">
              <div className="font-semibold text-brand-navy">{link.name}</div>
            </div>
            {linkFromErp && (
              <p className="rounded-md bg-brand-blue/10 px-3 py-2 text-xs text-brand-navy">
                {SECOND_STORE_ERP_NOTE}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Código</Label>
                <Input
                  value={codeEdit}
                  onChange={(e) => setCodeEdit(e.target.value)}
                  disabled={linkFromErp}
                />
              </Field>
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={stockEdit}
                  onChange={(e) => setStockEdit(Math.max(0, Number(e.target.value)))}
                  disabled={linkFromErp}
                />
              </Field>
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={retailPriceEdit}
                  onChange={(e) => setRetailPriceEdit(Math.max(0, Number(e.target.value)))}
                  disabled={linkFromErp}
                />
              </Field>
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={wholesalePriceEdit}
                  onChange={(e) => setWholesalePriceEdit(Math.max(0, Number(e.target.value)))}
                  disabled={linkFromErp}
                />
              </Field>
            </div>
            {!linkFromErp && (
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
            )}
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
                type="search"
                aria-label="Buscar en la tienda secundaria"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                // Typing replaces the SKU it opened with.
                onFocus={(e) => e.currentTarget.select()}
                placeholder="Buscar por nombre o código…"
                className="pl-8"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {unlinked.length === 0 && !creatingNew && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? `Ningún producto sin vincular coincide con “${search.trim()}”. Borra la búsqueda para verlos todos.`
                    : "No quedan productos sin vincular en la tienda secundaria."}
                </div>
              )}
              {unlinkedPage.pageItems.map(({ record: s, codeMatch }) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => linkExisting.mutate(s.id)}
                  disabled={linkExisting.isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-2 text-left text-sm hover:bg-brand-surface disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="break-words font-medium text-brand-navy">{s.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {s.code}
                      {codeMatch && (
                        <Badge
                          className={cn(
                            "px-1.5 py-0 text-[10px]",
                            codeMatch === "exact"
                              ? "bg-brand-blue text-white"
                              : "bg-brand-blue/10 text-brand-navy",
                          )}
                        >
                          {codeMatch === "exact" ? "Mismo código" : "Código parecido"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>Stock: {s.stock}</div>
                    <div>Mayor: {s.wholesalePrice ? formatMoneyAdmin(s.wholesalePrice) : "—"}</div>
                  </div>
                </button>
              ))}
            </div>
            <PaginationBar
              page={unlinkedPage.page}
              totalPages={unlinkedPage.totalPages}
              onChange={unlinkedPage.setPage}
              from={unlinkedPage.from}
              to={unlinkedPage.to}
              total={unlinkedPage.total}
            />

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
                <Field className="grid gap-1.5">
                  <Label className="text-xs font-medium text-brand-navy">
                    Nombre (como está en la otra tienda)
                  </Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Código (opcional)</Label>
                    <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} />
                  </Field>
                  <Field className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Stock</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newStock}
                      onChange={(e) => setNewStock(Math.max(0, Number(e.target.value)))}
                    />
                  </Field>
                  <Field className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Precio al detal</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newRetailPrice}
                      onChange={(e) => setNewRetailPrice(Math.max(0, Number(e.target.value)))}
                    />
                  </Field>
                  <Field className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Precio al mayor</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newWholesalePrice}
                      onChange={(e) => setNewWholesalePrice(Math.max(0, Number(e.target.value)))}
                    />
                  </Field>
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
  const { data: suppliers } = useSuppliers();
  const isEdit = Boolean(product);

  const [sku, setSku] = useState(product?.sku ?? "");
  const [model, setModel] = useState(product?.model ?? "");
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
        // Empty sends nothing, unless it clears one the product had.
        model: model.trim() || (product?.model ? null : undefined),
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
  // Profit Plus owns these on a product it brought: the sync would undo any
  // change made here, and the API refuses one.
  const fromErp = Boolean(product?.erpExternalId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        {/* Content-start on each field: in a two-column row a taller
            neighbour (one with a hint under it) stretched the other's
            label and control apart. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {fromErp && (
            <p className="rounded-md bg-brand-blue/10 px-3 py-2 text-xs text-brand-navy sm:col-span-2">
              Viene de Profit Plus: el código de barra, el SKU, el nombre, la categoría, los precios
              y el stock se cambian en Profit. Aquí puedes editar las especificaciones, la imagen,
              el costo, el stock mínimo y si está activo.
            </p>
          )}
          <Field className="grid content-start gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={fromErp} />
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Código de barra</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} disabled={fromErp} />
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">SKU</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={fromErp}
              placeholder={fromErp ? "Sin modelo en Profit" : "Opcional"}
            />
          </Field>
          <Field className="grid min-w-0 content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <div className="flex min-w-0 gap-2">
              <Select value={categoryId} onValueChange={setCategoryId} disabled={fromErp}>
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
                disabled={fromErp}
                onClick={() => setCreatingCategory(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field className="grid min-w-0 content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Proveedor</Label>
            {product?.brand ? (
              // The sync assigns it from the brand on every run: a change
              // here wouldn't last.
              <Input
                value={suppliers?.find((s) => s.id === supplierId)?.name ?? product.brand}
                disabled
              />
            ) : (
              <SupplierPicker value={supplierId} onChange={(id) => setSupplierId(id)} />
            )}
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio detal ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
              disabled={fromErp}
            />
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Precio mayor ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
              disabled={fromErp}
            />
          </Field>

          {fromErp && (
            // Profit Plus is the only source of this stock: every sale is
            // invoiced there, and the sync overwrites the web's figure.
            <Field className="grid content-start gap-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-brand-navy">Stock real</Label>
              <Input value={`${product!.stock} uds`} disabled />
            </Field>
          )}
          {/* What's edited here, after what comes from Profit Plus. */}
          {fromErp && <div className="border-t border-border sm:col-span-2" />}
          <Field className="grid content-start gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Especificaciones</Label>
            <Input
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
              placeholder="Opcional"
            />
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Costo ($, opcional)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <Field className="grid content-start gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Stock seguro (mínimo)</Label>
            <Input
              type="number"
              min={0}
              value={minStockThreshold}
              onChange={(e) => setMinStockThreshold(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          {isEdit && !product!.erpExternalId && (
            <Field className="grid content-start gap-1.5 sm:col-span-2">
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
            </Field>
          )}
          <Field className="grid content-start gap-1.5 sm:col-span-2">
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
          </Field>
          <Field className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="text-sm text-brand-navy">
              Producto activo (visible en el catálogo)
            </Label>
          </Field>
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
        <Field className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. Iluminación"
          />
        </Field>
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
