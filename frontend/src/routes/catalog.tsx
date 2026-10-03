import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Filter, LayoutGrid, List, Search, Tags } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { staggerContainer, staggerItem } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CARD_FOCUS_RING,
  CARD_HOVER_FLAT,
  CARD_IMAGE_ZOOM,
  CARD_LIFT,
  STRETCHED_LINK,
} from "@/components/card-interaction";
import { PaginationBar, usePagination } from "@/components/pagination";
import { PriceTag } from "@/components/price-tag";
import { ProductImage } from "@/components/product-image";
import { QuantityStepper } from "@/components/quantity-stepper";
import type { Product } from "@/lib/mock-data";
import { catalogQuery, toProduct } from "@/lib/product-api";
import { formatMoney, useElectronStore } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { absoluteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function useCatalogProducts() {
  return useQuery({ ...catalogQuery, select: (res) => res.data.map(toProduct) });
}

export const Route = createFileRoute("/catalog")({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catálogo de materiales eléctricos · Electron Plus" },
      {
        name: "description",
        content:
          "Bombillos LED, cables THHN, breakers, tableros y tomacorrientes con precio detal y mayorista. Filtra por categoría y cotiza en línea.",
      },
      { property: "og:title", content: "Catálogo de materiales eléctricos · Electron Plus" },
      {
        property: "og:description",
        content:
          "Bombillos LED, cables, breakers, tableros y tomas con precio detal y mayorista. Cotiza en línea.",
      },
      { property: "og:url", content: absoluteUrl("/catalog") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/catalog") }],
  }),
  component: CatalogPage,
});

const PAGE_SIZE = 9;

/** The slider's selection clamped to the current ceiling (the catalog can
 * shrink under it), and whether it actually narrows anything. */
function effectivePriceRange(
  selected: [number, number] | null,
  ceiling: number,
): { range: [number, number]; active: boolean } {
  if (!selected) return { range: [0, ceiling], active: false };
  const range: [number, number] = [Math.min(selected[0], ceiling), Math.min(selected[1], ceiling)];
  return { range, active: range[0] > 0 || range[1] < ceiling };
}

function CatalogPage() {
  const { q: initialQ, category: initialCategory } = Route.useSearch();
  const { priceFor, cart, addToCart, updateQty, removeFromCart } = useElectronStore();
  const { data: products, isLoading, isError } = useCatalogProducts();
  const { data: bcv } = useBcvRate();
  const [q, setQ] = useState(initialQ ?? "");
  const [cats, setCats] = useState<string[]>(initialCategory ? [initialCategory] : []);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // null = no price filter. The slider's ceiling follows the catalog's
  // priciest product — a fixed 0–100 range silently hid everything above
  // REF 100 even with no filter touched.
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const priceCeiling = useMemo(
    () =>
      Math.max(1, Math.ceil((products ?? []).reduce((max, p) => Math.max(max, priceFor(p)), 0))),
    [products, priceFor],
  );
  const { range, active: priceFiltered } = effectivePriceRange(priceRange, priceCeiling);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    const price = effectivePriceRange(priceRange, priceCeiling);
    return (products ?? []).filter((p) => {
      if (needle && !`${p.name} ${p.sku}`.toLowerCase().includes(needle)) return false;
      if (cats.length && !cats.includes(p.category)) return false;
      if (onlyAvailable && p.stock <= 0) return false;
      if (price.active) {
        const value = priceFor(p);
        if (value < price.range[0] || value > price.range[1]) return false;
      }
      return true;
    });
  }, [products, q, cats, onlyAvailable, priceRange, priceCeiling, priceFor]);

  // Straight from the data: Profit Plus defines its own categories, so a
  // hardcoded list would leave the real ones without a filter.
  const availableCategories = useMemo(() => {
    const labels = new Map<string, string>();
    for (const p of products ?? []) {
      if (!labels.has(p.category)) labels.set(p.category, p.categoryLabel ?? p.category);
    }
    return [...labels]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [products]);

  const pagination = usePagination(
    filtered,
    PAGE_SIZE,
    JSON.stringify([q, cats, onlyAvailable, priceRange]),
  );
  const resultsTop = useRef<HTMLElement>(null);

  const activeFilterCount = (onlyAvailable ? 1 : 0) + (priceFiltered ? 1 : 0);

  const handleQtyChange = (p: Product, currentQty: number, nextQty: number) => {
    if (nextQty <= 0) {
      removeFromCart(p.id);
    } else if (currentQty === 0) {
      addToCart(p, nextQty);
      toast.success(`Agregado: ${p.name}`);
    } else {
      updateQty(p.id, nextQty);
    }
  };

  return (
    <PublicShell>
      <section className="relative overflow-hidden border-b border-border bg-white">
        <CircuitBackground className="opacity-70" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Catálogo
          </div>
          <h1 className="mt-1 text-3xl font-bold text-brand-navy">Productos eléctricos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Precio detal y precio mayorista de referencia en cada producto — cotiza para acceder a
            descuentos especiales. Los precios no incluyen IVA (16%).
          </p>
          {bcv && (
            <div className="mt-3 inline-flex items-center rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-blue">
              Tasa BCV del día: {formatBs(1, bcv.rate)} por USD
            </div>
          )}
        </div>
      </section>

      <section ref={resultsTop} className="mx-auto max-w-7xl scroll-mt-20 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Tags className="h-4 w-4" />
                  Categorías
                  {cats.length > 0 && (
                    <Badge className="ml-0.5 h-5 min-w-5 justify-center rounded-full bg-brand-blue px-1 text-white">
                      {cats.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Categorías
                  </div>
                  {cats.length > 0 && (
                    <button
                      onClick={() => setCats([])}
                      className="text-xs font-medium text-brand-blue hover:underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div className="-mr-2 max-h-72 space-y-2 overflow-y-auto pr-2">
                  {availableCategories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-brand-navy">
                      <Checkbox
                        checked={cats.includes(c.id)}
                        onCheckedChange={(v) =>
                          setCats((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <Badge className="ml-0.5 h-5 min-w-5 justify-center rounded-full bg-brand-blue px-1 text-white">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Rango de precio (REF)
                  </div>
                  <Slider
                    value={range}
                    onValueChange={(v) => setPriceRange([v[0], v[1]])}
                    min={0}
                    max={priceCeiling}
                    step={1}
                    thumbLabels={["Precio mínimo", "Precio máximo"]}
                  />
                  <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{formatMoney(range[0])}</span>
                    <span>{formatMoney(range[1])}</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-brand-navy">
                  <Checkbox
                    checked={onlyAvailable}
                    onCheckedChange={(v) => setOnlyAvailable(!!v)}
                  />
                  Solo disponibles
                </label>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setOnlyAvailable(false);
                      setPriceRange(null);
                    }}
                    className="mt-4 text-xs font-medium text-brand-blue hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </PopoverContent>
            </Popover>

            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as "grid" | "list")}
              className="rounded-md border border-input"
            >
              <ToggleGroupItem value="grid" aria-label="Vista de cuadrícula" className="h-9 w-9">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Vista de lista" className="h-9 w-9">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="mb-4 mt-4 text-sm text-muted-foreground">
          {filtered.length} producto{filtered.length === 1 ? "" : "s"}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
              <CatalogCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <Card className="p-10 text-center">
            <div className="text-sm font-semibold text-brand-navy">
              No pudimos cargar el catálogo
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Intenta de nuevo en unos minutos.</p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-sm font-semibold text-brand-navy">
              Sin resultados con estos filtros
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Prueba ampliando el rango de precio o quitando alguna categoría.
            </p>
          </Card>
        ) : (
          <>
            <motion.div
              key={view}
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className={
                view === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  : "flex flex-col gap-3"
              }
            >
              <AnimatePresence mode="popLayout">
                {pagination.pageItems.map((p, index) => {
                  const qty = cart.find((i) => i.product.id === p.id)?.qty ?? 0;
                  return view === "grid" ? (
                    <motion.div
                      key={p.id}
                      layout
                      variants={staggerItem}
                      custom={index}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                    >
                      <ProductCard
                        product={p}
                        qty={qty}
                        onQtyChange={(next) => handleQtyChange(p, qty, next)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={p.id}
                      layout
                      variants={staggerItem}
                      custom={index}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                    >
                      <ProductListRow
                        product={p}
                        qty={qty}
                        onQtyChange={(next) => handleQtyChange(p, qty, next)}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>

            <PaginationBar
              className="mt-8"
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={pagination.setPage}
              scrollAnchor={resultsTop}
            />
          </>
        )}
      </section>
    </PublicShell>
  );
}

function CatalogCardSkeleton() {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border p-0 shadow-sm">
      <Skeleton className="aspect-square rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-2 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="mt-auto pt-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2 h-8 w-full rounded-md" />
        </div>
      </div>
    </Card>
  );
}

function ProductCard({
  product,
  qty,
  onQtyChange,
}: {
  product: Product;
  qty: number;
  onQtyChange: (qty: number) => void;
}) {
  const low = product.stock > 0 && product.stock <= 10;
  const out = product.stock <= 0;
  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden border-border p-0 shadow-sm",
        CARD_LIFT,
        CARD_FOCUS_RING,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-brand-surface">
        <ProductImage
          src={product.thumbnail}
          alt={product.name}
          className={cn("h-full w-full", CARD_IMAGE_ZOOM)}
        />
        {out && (
          <Badge className="absolute left-2 top-2 bg-destructive text-destructive-foreground">
            Agotado
          </Badge>
        )}
        {low && (
          <Badge className="absolute left-2 top-2 bg-brand-yellow text-brand-navy">
            Últimas unidades
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {product.sku}
        </div>
        <h3 className="mt-0.5 line-clamp-2 min-h-9 text-xs font-semibold text-brand-navy">
          <Link to="/product/$id" params={{ id: product.id }} className={STRETCHED_LINK}>
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{product.specs}</p>

        <div className="mt-auto pt-3">
          <PriceTag product={product} size="sm" />
          <div className="relative z-10 mt-2">
            <QuantityStepper
              qty={qty}
              onChange={onQtyChange}
              disabled={out}
              fullWidth
              addLabel={out ? "No disponible" : "Agregar"}
              max={product.stock}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ProductListRow({
  product,
  qty,
  onQtyChange,
}: {
  product: Product;
  qty: number;
  onQtyChange: (qty: number) => void;
}) {
  const out = product.stock <= 0;
  const low = product.stock > 0 && product.stock <= 10;
  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden border-border p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4",
        CARD_HOVER_FLAT,
        CARD_FOCUS_RING,
      )}
    >
      <div className="flex min-w-0 items-center gap-4 sm:flex-1">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-brand-surface sm:h-24 sm:w-24">
          <ProductImage
            src={product.thumbnail}
            alt={product.name}
            className={cn("h-full w-full", CARD_IMAGE_ZOOM)}
          />
          {out && (
            <Badge className="absolute left-1 top-1 bg-destructive px-1.5 py-0 text-[9px] text-destructive-foreground">
              Agotado
            </Badge>
          )}
          {low && (
            <Badge className="absolute left-1 top-1 bg-brand-yellow px-1.5 py-0 text-[9px] text-brand-navy">
              Últimas
            </Badge>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {product.sku}
          </div>
          <h3 className="line-clamp-1 text-sm font-semibold text-brand-navy">
            <Link to="/product/$id" params={{ id: product.id }} className={STRETCHED_LINK}>
              {product.name}
            </Link>
          </h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">{product.specs}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
        <PriceTag product={product} size="sm" />
        <div className="relative z-10">
          <QuantityStepper
            qty={qty}
            onChange={onQtyChange}
            disabled={out}
            addLabel={out ? "No disponible" : "Agregar"}
            max={product.stock}
          />
        </div>
      </div>
    </Card>
  );
}
