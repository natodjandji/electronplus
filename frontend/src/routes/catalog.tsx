import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Filter, LayoutGrid, List, Search, Tags } from "lucide-react";
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
import { PriceTag } from "@/components/price-tag";
import { ProductImage } from "@/components/product-image";
import { QuantityStepper } from "@/components/quantity-stepper";
import { CATEGORIES, type Product } from "@/lib/mock-data";
import { apiFetch } from "@/lib/api-client";
import { type ApiProduct, toProduct } from "@/lib/product-api";
import { useElectronStore } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { absoluteUrl } from "@/lib/site-url";
import { toast } from "sonner";

function useCatalogProducts() {
  return useQuery({
    queryKey: ["catalog", "products"],
    queryFn: () => apiFetch<{ data: ApiProduct[] }>("/products?limit=100"),
    select: (res) => res.data.map(toProduct),
  });
}

export const Route = createFileRoute("/catalog")({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catálogo · Electron Plus" },
      {
        name: "description",
        content: "Explora iluminación, cables, breakers, tableros y tomas con filtros avanzados.",
      },
      { property: "og:title", content: "Catálogo · Electron Plus" },
      { property: "og:description", content: "Productos eléctricos con precio detal y mayorista." },
      { property: "og:url", content: absoluteUrl("/catalog") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/catalog") }],
  }),
  component: CatalogPage,
});

const PAGE_SIZE = 9;

function CatalogPage() {
  const { q: initialQ, category: initialCategory } = Route.useSearch();
  const { priceFor, cart, addToCart, updateQty, removeFromCart } = useElectronStore();
  const { data: products, isLoading, isError } = useCatalogProducts();
  const { data: bcv } = useBcvRate();
  const [q, setQ] = useState(initialQ ?? "");
  const [cats, setCats] = useState<string[]>(initialCategory ? [initialCategory] : []);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 100]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return (products ?? []).filter((p) => {
      if (q && !`${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (cats.length && !cats.includes(p.category)) return false;
      if (onlyAvailable && p.stock <= 0) return false;
      const price = priceFor(p);
      if (price < range[0] || price > range[1]) return false;
      return true;
    });
  }, [products, q, cats, onlyAvailable, range, priceFor]);

  useEffect(() => {
    setPage(1);
  }, [q, cats, onlyAvailable, range]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeFilterCount = (onlyAvailable ? 1 : 0) + (range[0] > 0 || range[1] < 100 ? 1 : 0);

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

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
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
                <div className="space-y-2">
                  {CATEGORIES.map((c) => (
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
                    Rango de precio (USD)
                  </div>
                  <Slider
                    value={range}
                    onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>${range[0]}</span>
                    <span>${range[1]}</span>
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
                      setRange([0, 100]);
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
                {paged.map((p) => {
                  const qty = cart.find((i) => i.product.id === p.id)?.qty ?? 0;
                  return view === "grid" ? (
                    <motion.div
                      key={p.id}
                      layout
                      variants={staggerItem}
                      exit={{ opacity: 0, scale: 0.96 }}
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
                      exit={{ opacity: 0, scale: 0.96 }}
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

            {totalPages > 1 && (
              <Pager page={currentPage} totalPages={totalPages} onChange={setPage} />
            )}
          </>
        )}
      </section>
    </PublicShell>
  );
}

function useGoToProduct(id: string) {
  const navigate = useNavigate();
  const go = () => navigate({ to: "/product/$id", params: { id } });
  const onClick = () => go();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };
  return { onClick, onKeyDown };
}

function stopPropagation(e: MouseEvent) {
  e.stopPropagation();
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
  const { onClick, onKeyDown } = useGoToProduct(product.id);

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="group flex h-full cursor-pointer flex-col overflow-hidden border-border p-0 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/40 hover:shadow-[0_8px_30px_-8px_rgba(0,86,179,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <div className="relative aspect-square overflow-hidden bg-brand-surface">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]"
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
          {product.name}
        </h3>
        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{product.specs}</p>

        <div className="mt-auto pt-3">
          <PriceTag product={product} size="sm" />
          <div className="mt-2" onClick={stopPropagation}>
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
  const { onClick, onKeyDown } = useGoToProduct(product.id);

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="group flex cursor-pointer flex-col gap-3 overflow-hidden border-border p-3 shadow-sm transition-all duration-300 hover:border-brand-blue/40 hover:shadow-[0_8px_30px_-8px_rgba(0,86,179,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:flex-row sm:items-center sm:gap-4 sm:p-4"
    >
      <div className="flex min-w-0 items-center gap-4 sm:flex-1">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-brand-surface sm:h-24 sm:w-24">
          <ProductImage
            src={product.image}
            alt={product.name}
            className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]"
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
          <h3 className="line-clamp-1 text-sm font-semibold text-brand-navy">{product.name}</h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">{product.specs}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
        <PriceTag product={product} size="sm" />
        <div onClick={stopPropagation}>
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

function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const pages = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);

  return (
    <div className="mt-8 flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="icon"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((p) => (
        <Button
          key={p}
          variant={p === page ? "default" : "outline"}
          size="icon"
          onClick={() => onChange(p)}
          className={p === page ? "bg-brand-blue text-white hover:bg-brand-blue/90" : ""}
        >
          {p}
        </Button>
      ))}
      <Button
        variant="outline"
        size="icon"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Página siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
