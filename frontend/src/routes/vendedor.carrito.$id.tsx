import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ComponentProps, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Printer,
  ScanLine,
  Search,
  Share2,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { CodeScanner } from "@/components/seller/code-scanner";
import { SellerShell } from "@/components/seller/seller-shell";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/electron-store";
import type { Product } from "@/lib/product";
import { catalogQuery, toProduct, type ApiProduct } from "@/lib/product-api";
import {
  computeCartTotals,
  findScannedProduct,
  formatQuoteNumber,
  unitPriceFor,
  whatsappShareHref,
  type PriceList,
  type SalesCart,
  type SalesCartCustomer,
  type SalesCartItem,
  type SharedQuoteLink,
} from "@/lib/sales-carts";
import { openPdf } from "@/lib/open-pdf";
import { primeScanSound, scanFeedback } from "@/lib/scan-feedback";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import {
  quotePdfUrl,
  useCreateSalesCart,
  useSalesCart,
  useSalesCartActions,
  useSecondStoreStock,
} from "@/lib/use-sales-carts";
import { round2 } from "@/lib/money";

export const Route = createFileRoute("/vendedor/carrito/$id")({
  component: SalesCartPage,
});

const selectProducts = (res: { data: ApiProduct[] }) => res.data.map(toProduct);

/** The storefront catalog the page already loads, indexed for scans: a
 * label resolves to a product without asking the server. */
function useCatalogIndex() {
  // A minute rather than the storefront's five: stock moves during the day
  // and the seller is quoting from it.
  const { data: products, isLoading } = useQuery({
    ...catalogQuery,
    staleTime: 60_000,
    select: selectProducts,
  });
  return useMemo(() => {
    const list = products ?? [];
    return {
      products: list,
      isLoading,
      byId: new Map(list.map((p) => [p.id, p])),
      bySku: new Map(list.map((p) => [p.sku.toUpperCase(), p])),
    };
  }, [products, isLoading]);
}

type CatalogIndex = ReturnType<typeof useCatalogIndex>;

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "long" });
}

function SalesCartPage() {
  const { id } = Route.useParams();
  const { data: cart, isLoading, isError } = useSalesCart(id);

  if (isLoading) {
    return (
      <SellerShell>
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
        <Skeleton className="mt-2 h-24 w-full rounded-xl" />
      </SellerShell>
    );
  }
  if (isError || !cart) {
    return (
      <SellerShell>
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No encontramos este carrito.{" "}
          <Link to="/vendedor" className="font-medium text-brand-blue hover:underline">
            Volver a los carritos
          </Link>
        </Card>
      </SellerShell>
    );
  }
  // Keyed so the next cart (after finishing a sale) starts with its own
  // state, and anything still pending is sent for the cart it belongs to.
  return <CartScreen key={cart.id} cart={cart} />;
}

function CartScreen({ cart }: { cart: SalesCart }) {
  const navigate = useNavigate();
  const actions = useSalesCartActions(cart.id);
  const createCart = useCreateSalesCart();
  const catalog = useCatalogIndex();
  const { data: secondStock } = useSecondStoreStock();
  const stockOf = (productId: string): StoreStock => ({
    principal: catalog.byId.get(productId)?.stock,
    secondary: secondStock ? (secondStock[productId] ?? null) : undefined,
  });
  const [scanning, setScanning] = useState(false);
  const [shareLink, setShareLink] = useState<SharedQuoteLink | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const editable = cart.status === "open";
  const units = cart.items.reduce((sum, i) => sum + i.qty, 0);
  const empty = cart.items.length === 0;

  const addProduct = (product: Product) => {
    const inCart = cart.items.find((i) => i.productId === product.id)?.qty ?? 0;
    actions.addProduct(product);
    toast.success(product.name, {
      id: "sales-cart-scan",
      description: `${inCart + 1} en el carrito`,
    });
  };

  const handleCode = (raw: string) => {
    const product = findScannedProduct(raw, catalog);
    if (!product) {
      scanFeedback(false);
      toast.error("Código no encontrado en el catálogo", {
        id: "sales-cart-scan",
        description: raw.length > 48 ? `${raw.slice(0, 48)}…` : raw,
      });
      return;
    }
    scanFeedback(true);
    addProduct(product);
  };

  const startNewCart = (replace: boolean) =>
    createCart.mutate(undefined, {
      onSuccess: (next) =>
        navigate({ to: "/vendedor/carrito/$id", params: { id: next.id }, replace }),
    });

  // Shares first, so the PDF has what's in the cart now. A failed share
  // was already reported by the mutation.
  const printQuote = () =>
    void openPdf(async () => quotePdfUrl((await actions.share.mutateAsync()).token)).catch(
      () => undefined,
    );

  return (
    <SellerShell>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
          <Link to="/vendedor" aria-label="Volver a los carritos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-brand-navy">
            {cart.customer.name || "Cliente sin nombre"}
          </h1>
          <p className="text-xs text-muted-foreground">
            Carrito {cart.id.slice(0, 6).toUpperCase()}
            {cart.quoteNumber !== undefined &&
              ` · Cotización ${formatQuoteNumber(cart.quoteNumber)}`}
          </p>
        </div>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más opciones">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setCancelling(true)}
              >
                <XCircle className="h-4 w-4" /> Cancelar carrito
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!editable && <ClosedBanner cart={cart} />}

      {editable && (
        <div className="space-y-3">
          {scanning ? (
            <CodeScanner onCode={handleCode} onClose={() => setScanning(false)} />
          ) : (
            <Button
              size="lg"
              onClick={() => {
                primeScanSound();
                setScanning(true);
              }}
              className="h-14 w-full gap-2 rounded-xl bg-brand-blue text-base text-white hover:bg-brand-blue/90"
            >
              <ScanLine className="h-5 w-5" /> Escanear etiqueta
            </Button>
          )}
          <ProductSearch catalog={catalog} stockOf={stockOf} onPick={addProduct} />
        </div>
      )}

      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Productos
          </h2>
          {!empty && (
            <span className="text-xs text-muted-foreground">
              {units} {units === 1 ? "unidad" : "unidades"}
            </span>
          )}
        </div>
        {empty ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Escanea la etiqueta de un producto o búscalo por nombre para agregarlo.
          </Card>
        ) : (
          <div className="space-y-2">
            {[...cart.items].reverse().map((item) => (
              <CartLine
                key={item.productId}
                item={item}
                priceList={cart.priceList}
                stock={stockOf(item.productId)}
                editable={editable}
                onQty={(qty) => actions.setQty(item.productId, qty)}
              />
            ))}
          </div>
        )}
      </section>

      <CustomerCard
        key={cart.id}
        customer={cart.customer}
        editable={editable}
        onSave={(customer) => actions.update({ customer })}
      />

      <PricingCard cart={cart} editable={editable} onChange={actions.update} />

      <TotalsCard cart={cart} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur print:hidden">
        <div
          className={`mx-auto grid max-w-2xl gap-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 ${
            editable ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {editable ? (
            <>
              <Button
                variant="outline"
                className="h-12 flex-col gap-0.5 text-xs"
                disabled={empty || actions.share.isPending}
                onClick={() => actions.share.mutate(undefined, { onSuccess: setShareLink })}
              >
                {actions.share.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Compartir
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-col gap-0.5 text-xs"
                disabled={empty || actions.share.isPending}
                onClick={printQuote}
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button
                className="h-12 flex-col gap-0.5 bg-emerald-600 text-xs text-white hover:bg-emerald-600/90"
                disabled={empty}
                onClick={() => setFinishing(true)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Finalizar
              </Button>
            </>
          ) : (
            <>
              {cart.quoteToken ? (
                <Button variant="outline" className="h-12 flex-col gap-0.5 text-xs" asChild>
                  <Link
                    to="/cotizacion/$token"
                    params={{ token: cart.quoteToken }}
                    search={{ carrito: cart.id }}
                  >
                    <FileText className="h-4 w-4" />
                    Cotización
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" className="h-12 flex-col gap-0.5 text-xs" disabled>
                  <FileText className="h-4 w-4" />
                  Cotización
                </Button>
              )}
              <Button
                className="h-12 flex-col gap-0.5 bg-brand-blue text-xs text-white hover:bg-brand-blue/90"
                disabled={createCart.isPending}
                onClick={() => startNewCart(false)}
              >
                <Plus className="h-4 w-4" />
                Nuevo carrito
              </Button>
            </>
          )}
        </div>
      </div>

      <ShareDialog cart={cart} link={shareLink} onClose={() => setShareLink(null)} />

      <FinishDialog
        open={finishing}
        pending={actions.complete.isPending || createCart.isPending}
        onClose={() => setFinishing(false)}
        onConfirm={(invoiceRef) =>
          actions.complete.mutate(invoiceRef, {
            onSuccess: () => {
              setFinishing(false);
              toast.success("Venta finalizada", { description: "Listo un carrito nuevo." });
              startNewCart(true);
            },
          })
        }
      />

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este carrito?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina sin venta y no queda registro de él. Si compartiste una cotización, el
              enlace sigue funcionando hasta su fecha de validez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                actions.cancel.mutate(undefined, {
                  onSuccess: () => navigate({ to: "/vendedor", replace: true }),
                })
              }
            >
              Cancelar carrito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SellerShell>
  );
}

/** Only a finished sale is ever closed — a cancelled cart is deleted. */
function ClosedBanner({ cart }: { cart: SalesCart }) {
  return (
    <Card className="mb-4 flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 text-sm">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <div>
        <div className="font-semibold text-brand-navy">Venta finalizada</div>
        <div className="text-muted-foreground">
          {cart.invoiceRef ? `Factura ${cart.invoiceRef} · ` : ""}
          {cart.closedAt &&
            new Date(cart.closedAt).toLocaleString("es-VE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
        </div>
      </div>
    </Card>
  );
}

/** Finds a product by name or code — for a worn label, or a product
 * without one. Enter adds an exact code match, or the only result. */
function ProductSearch({
  catalog,
  stockOf,
  onPick,
}: {
  catalog: CatalogIndex;
  stockOf: (productId: string) => StoreStock;
  onPick: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = normalize(query.trim());
  const results =
    needle.length >= 2
      ? catalog.products.filter((p) => normalize(`${p.name} ${p.sku}`).includes(needle)).slice(0, 6)
      : [];

  const pick = (product: Product) => {
    onPick(product);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = findScannedProduct(query, catalog);
    if (exact) pick(exact);
    else if (results.length === 1) pick(results[0]);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={catalog.isLoading ? "Cargando catálogo…" : "Buscar por nombre o código"}
        aria-label="Buscar producto por nombre o código"
        className="h-11 bg-white pl-9 text-base sm:text-sm"
        enterKeyHint="search"
        autoComplete="off"
      />
      {needle.length >= 2 && (
        <Card className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden p-0 shadow-lg">
          {results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {catalog.products.length === 0
                ? "El catálogo todavía no tiene productos."
                : "Sin resultados."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => pick(product)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-surface active:bg-brand-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-brand-navy">
                        {product.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{product.sku}</div>
                      <StockBadges stock={stockOf(product.id)} />
                    </div>
                    <div className="shrink-0 text-sm font-semibold tabular-nums text-brand-navy">
                      {formatMoney(product.retailPrice)}
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-brand-blue" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/** Units in each store; `secondary` is undefined while it loads, null when
 * the product isn't linked to a second-store record. */
interface StoreStock {
  principal: number | undefined;
  secondary: number | null | undefined;
}

/** Both stores' stock, for the seller only — the quote never shows it. */
function StockBadges({ stock }: { stock: StoreStock }) {
  const badge = (label: string, value: number | null | undefined) => {
    if (value === undefined) return null;
    const tone =
      value === null
        ? "bg-muted text-muted-foreground"
        : value <= 0
          ? "bg-destructive/10 text-destructive"
          : "bg-brand-blue/10 text-brand-blue";
    return (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}>
        {label}: {value === null ? "sin dato" : value}
      </span>
    );
  };
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {badge("Principal", stock.principal)}
      {badge("Secundaria", stock.secondary)}
    </div>
  );
}

function CartLine({
  item,
  priceList,
  stock,
  editable,
  onQty,
}: {
  item: SalesCartItem;
  priceList: PriceList;
  stock: StoreStock;
  editable: boolean;
  onQty: (qty: number) => void;
}) {
  const unitPrice = unitPriceFor(item, priceList);
  const short = stock.principal !== undefined && item.qty > stock.principal;
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-brand-navy">{item.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.sku} · {formatMoney(unitPrice)} c/u
          </div>
          {editable && <StockBadges stock={stock} />}
          {editable && short && (
            <div className="mt-1 text-xs font-medium text-amber-700">
              Pide más de lo que hay en la tienda principal
            </div>
          )}
        </div>
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Quitar ${item.name}`}
            onClick={() => onQty(0)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        {editable ? (
          <QuantityStepper qty={item.qty} onChange={onQty} size="sm" />
        ) : (
          <span className="text-sm text-muted-foreground">× {item.qty}</span>
        )}
        <span className="font-semibold tabular-nums text-brand-navy">
          {formatMoney(unitPrice * item.qty)}
        </span>
      </div>
    </Card>
  );
}

/** Saved when a field loses focus, so typing costs no writes. */
function CustomerCard({
  customer,
  editable,
  onSave,
}: {
  customer: SalesCartCustomer;
  editable: boolean;
  onSave: (customer: SalesCartCustomer) => void;
}) {
  const [draft, setDraft] = useState<SalesCartCustomer>(customer);
  const save = () => {
    const clean = (v?: string) => v?.trim() || undefined;
    const next = { name: clean(draft.name), taxId: clean(draft.taxId), phone: clean(draft.phone) };
    if (
      next.name !== customer.name ||
      next.taxId !== customer.taxId ||
      next.phone !== customer.phone
    ) {
      onSave(next);
    }
  };
  const field = (
    key: keyof SalesCartCustomer,
    label: string,
    props: Partial<ComponentProps<typeof Input>>,
  ) => (
    <Field className="grid gap-1.5">
      <Label className="text-xs font-medium text-brand-navy">{label}</Label>
      <Input
        value={draft[key] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={save}
        disabled={!editable}
        className="h-11 text-base sm:text-sm"
        {...props}
      />
    </Field>
  );
  return (
    <Card className="mt-5 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Cliente <span className="font-normal normal-case tracking-normal">(opcional)</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("name", "Nombre", { autoComplete: "off", maxLength: 120 })}
        {field("taxId", "RIF o cédula", { autoComplete: "off", maxLength: 30 })}
        {field("phone", "Teléfono", {
          type: "tel",
          inputMode: "tel",
          autoComplete: "off",
          maxLength: 30,
        })}
      </div>
    </Card>
  );
}

function PricingCard({
  cart,
  editable,
  onChange,
}: {
  cart: SalesCart;
  editable: boolean;
  onChange: (patch: { priceList?: PriceList; discountPct?: number }) => void;
}) {
  const [discount, setDiscount] = useState(String(cart.discountPct || ""));

  const commitDiscount = () => {
    const parsed = Number(discount.replace(",", "."));
    const value = Number.isFinite(parsed) ? round2(Math.min(Math.max(parsed, 0), 100)) : 0;
    setDiscount(value ? String(value) : "");
    if (value !== cart.discountPct) onChange({ discountPct: value });
  };

  return (
    <Card className="mt-3 grid gap-4 p-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-brand-navy">Lista de precios</span>
        <ToggleGroup
          type="single"
          value={cart.priceList}
          onValueChange={(v) =>
            v && v !== cart.priceList && onChange({ priceList: v as PriceList })
          }
          disabled={!editable}
          className="grid grid-cols-2 rounded-md border border-input p-0.5"
        >
          <ToggleGroupItem
            value="retail"
            className="h-10 data-[state=on]:bg-brand-blue data-[state=on]:text-white"
          >
            Detal
          </ToggleGroupItem>
          <ToggleGroupItem
            value="wholesale"
            className="h-10 data-[state=on]:bg-brand-blue data-[state=on]:text-white"
          >
            Al mayor
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Field className="grid gap-1.5">
        <Label className="text-xs font-medium text-brand-navy">Descuento</Label>
        <div className="relative">
          <Input
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            onBlur={commitDiscount}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            disabled={!editable}
            inputMode="decimal"
            placeholder="0"
            className="h-11 pr-8 text-base sm:text-sm"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
      </Field>
    </Card>
  );
}

function TotalsCard({ cart }: { cart: SalesCart }) {
  const { data: bcv } = useBcvRate();
  const totals = computeCartTotals(cart);
  const row = (label: string, value: string) => (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-brand-navy">{value}</span>
    </div>
  );
  return (
    <Card className="mt-3 space-y-1.5 p-4">
      {row("Subtotal", formatMoney(totals.subtotal))}
      {cart.discountPct > 0 &&
        row(`Descuento (${cart.discountPct}%)`, `-${formatMoney(totals.discountAmount)}`)}
      {row("IVA (16%)", formatMoney(totals.taxAmount))}
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold text-brand-navy">Total</span>
        <span className="text-2xl font-bold tabular-nums text-brand-navy">
          {formatMoney(totals.total)}
        </span>
      </div>
      {bcv && (
        <div className="text-right text-xs text-muted-foreground">
          {formatBs(totals.total, bcv.rate)} a tasa BCV
        </div>
      )}
    </Card>
  );
}

function ShareDialog({
  cart,
  link,
  onClose,
}: {
  cart: SalesCart;
  link: SharedQuoteLink | null;
  onClose: () => void;
}) {
  if (!link) return null;
  const firstName = cart.customer.name?.split(/\s+/)[0];
  const message = `Hola${firstName ? ` ${firstName}` : ""}, aquí está tu cotización de Electron Plus (N.º ${formatQuoteNumber(
    link.number,
  )}), válida hasta el ${formatDate(link.validUntil)}: ${link.url}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cotización N.º {formatQuoteNumber(link.number)} lista</DialogTitle>
          <DialogDescription>
            Válida hasta el {formatDate(link.validUntil)}. El cliente la abre sin crear cuenta. Si
            cambias el carrito, compártela de nuevo para actualizarla: el enlace es el mismo.
          </DialogDescription>
        </DialogHeader>
        <div className="select-all break-all rounded-md border border-border bg-brand-surface px-3 py-2 text-sm text-brand-navy">
          {link.url}
        </div>
        <div className="grid gap-2">
          <Button asChild className="h-11 gap-2 bg-[#25D366] text-white hover:bg-[#25D366]/90">
            <a
              href={whatsappShareHref(message, cart.customer.phone)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
            </a>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {canShare ? (
              <Button
                variant="outline"
                className="h-11 gap-2"
                onClick={() =>
                  void navigator
                    .share({ title: "Cotización Electron Plus", text: message, url: link.url })
                    .catch(() => undefined)
                }
              >
                <Share2 className="h-4 w-4" /> Compartir…
              </Button>
            ) : (
              <Button variant="outline" className="h-11 gap-2" onClick={() => void copy()}>
                <Copy className="h-4 w-4" /> Copiar enlace
              </Button>
            )}
            <Button variant="outline" className="h-11 gap-2" asChild>
              <Link
                to="/cotizacion/$token"
                params={{ token: link.token }}
                search={{ carrito: cart.id }}
              >
                <ExternalLink className="h-4 w-4" /> Ver
              </Link>
            </Button>
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          {canShare && (
            <button
              type="button"
              onClick={() => void copy()}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              Copiar enlace
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (invoiceRef?: string) => void;
}) {
  const [invoiceRef, setInvoiceRef] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar venta</DialogTitle>
          <DialogDescription>
            Ciérralo cuando la venta ya esté facturada en Profit. Después no se podrá editar y se
            abre un carrito nuevo.
          </DialogDescription>
        </DialogHeader>
        <Field className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">
            N.º de factura en Profit (opcional)
          </Label>
          <Input
            value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
            maxLength={40}
            autoComplete="off"
            className="h-11 text-base sm:text-sm"
          />
        </Field>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Volver
          </Button>
          <Button
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90"
            disabled={pending}
            onClick={() => onConfirm(invoiceRef.trim() || undefined)}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Finalizar venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
