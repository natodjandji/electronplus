import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Loader2, Printer, QrCode, Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { ProductGroupsPanel } from "@/components/admin/product-groups-panel";
import { PaginationBar, usePagination } from "@/components/pagination";
import { ElectronLogo } from "@/components/electron-logo";
import { useSuppliers } from "@/components/supplier-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuantityStepper } from "@/components/quantity-stepper";
import { matchesWords } from "@/lib/product-search";
import { apiFetch } from "@/lib/api-client";
import { TAX_RATE } from "@/lib/electron-store";
import { round2 } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/labels")({
  head: () => ({
    meta: [
      { title: "Etiquetas · Admin Electron Plus" },
      {
        name: "description",
        content: "Genera e imprime etiquetas de almacén, producto y precio para cada producto.",
      },
      { property: "og:title", content: "Etiquetas · Electron Plus" },
      { property: "og:description", content: "Etiquetas imprimibles para tienda y depósito." },
    ],
  }),
  component: LabelsPage,
});

interface AdminProduct {
  id: string;
  /** The barcode. */
  sku: string;
  /** The store's SKU (Profit Plus's Modelo field). */
  model?: string | null;
  name: string;
  supplierId?: string;
}

interface QrLabel {
  productId: string;
  /** The barcode: what the "producto" format encodes. */
  sku: string;
  /** The store's SKU, printed on the "precio" format. */
  model?: string | null;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  /** QR pointing at the storefront page — used by both the "precio" and "almacén" formats. */
  qrImageDataUrl: string;
  /** Scannable Code128 barcode (the number baked in as human-readable text) — the "producto" format. */
  barcodeImageDataUrl: string;
}

type LabelFormat = "almacen" | "producto" | "precio";

const FORMAT_OPTIONS: { value: LabelFormat; label: string; hint: string }[] = [
  {
    value: "almacen",
    label: "Almacén",
    hint: "Descripción y QR a la ficha del producto — para identificar bultos en el depósito, sin precios.",
  },
  {
    value: "producto",
    label: "Producto",
    hint: "Código de barra escaneable y descripción — para pegar en el producto.",
  },
  {
    value: "precio",
    label: "Precio",
    hint: "QR, proveedor, nombre, SKU y precios detal/mayor con desglose de IVA y total.",
  },
];

// Shares its queryKey/cache with the other admin pages' GET /products/admin.
// Search filters it in the browser — it used to send a request per keystroke.
function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products", ""],
    queryFn: () => apiFetch<AdminProduct[]>("/products/admin"),
  });
}

const PICKER_PAGE_SIZE = 15;
const LABEL_PRICE_FORMAT = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function useQrLabels(productIds: string[]) {
  const key = [...productIds].sort().join(",");
  return useQuery({
    queryKey: ["admin", "qr-labels", key],
    queryFn: () => apiFetch<QrLabel[]>("/qr/labels", { method: "POST", body: { productIds } }),
    enabled: productIds.length > 0,
  });
}

/** 50x30mm landscape — the physical label size the Xprinter XP-D4601B is loaded with. */
const LABEL_PRINT_STYLE = `
  @media print {
    @page { size: 50mm 30mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .toaster { display: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .qr-label { width: 50mm; height: 30mm; page-break-inside: avoid; }
  @media print {
    .qr-label { break-after: page; page-break-after: always; }
    .qr-label:last-child { break-after: auto; page-break-after: auto; }
  }
`;

function LabelCard({
  label,
  format,
}: {
  label: QrLabel & { key: string; supplierName?: string };
  format: LabelFormat;
}) {
  if (format === "almacen") {
    return (
      <div className="qr-label flex items-center gap-2 overflow-hidden border border-dashed border-brand-blue/30 bg-white p-2 print:border-none">
        <img
          src={label.qrImageDataUrl}
          alt=""
          className="h-[22mm] w-[22mm] shrink-0 object-contain"
        />
        <div className="line-clamp-4 text-[12px] font-bold leading-tight text-black">
          {label.name}
        </div>
      </div>
    );
  }

  if (format === "producto") {
    return (
      <div className="qr-label flex flex-col items-center justify-center gap-1 overflow-hidden border border-dashed border-brand-blue/30 bg-white p-1.5 print:border-none">
        <div className="line-clamp-1 w-full text-center text-[10px] font-bold leading-tight text-black">
          {label.name}
        </div>
        <img
          src={label.barcodeImageDataUrl}
          alt=""
          className="h-[18mm] w-full max-w-[46mm] object-contain"
        />
      </div>
    );
  }

  // A one-unit price uses the same base, IVA and cent rounding as a sale.
  const prices = [label.retailPrice, label.wholesalePrice].map((price) => {
    const base = round2(price);
    const tax = round2(base * TAX_RATE);
    return { base, tax, total: round2(base + tax) };
  });
  // Keep long amounts inside their fixed-width columns without cutting off digits.
  const longestPrice = Math.max(
    ...prices.flatMap((price) =>
      Object.values(price).map((value) => LABEL_PRICE_FORMAT.format(value).length),
    ),
  );
  const amountFontSize = Math.min(7.5, 52 / longestPrice);
  const totalFontSize = Math.min(9.5, (longestPrice <= 6 ? 48 : 52) / longestPrice);

  return (
    <div className="qr-label flex items-center gap-1.5 overflow-hidden border border-dashed border-brand-blue/30 bg-white p-1.5 print:border-none">
      <div className="flex w-[17mm] shrink-0 flex-col items-center gap-[1mm]">
        <ElectronLogo layout="wordmark" tone="black" className="h-[2.8mm] w-auto shrink-0" />
        <img
          src={label.qrImageDataUrl}
          alt=""
          className="h-[17mm] w-[17mm] shrink-0 object-contain"
        />
        {label.supplierName && (
          <div className="line-clamp-2 w-full text-center text-[7px] font-semibold leading-[1.1] text-black [overflow-wrap:anywhere]">
            {label.supplierName}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[1.5px]">
        {label.model && (
          <span className="w-full text-[7.5px] font-semibold leading-[1.1] text-black [overflow-wrap:anywhere]">
            {label.model}
          </span>
        )}
        <div className="line-clamp-2 text-[9.5px] font-bold leading-[1.1] text-black">
          {label.name}
        </div>
        <table
          aria-label="Precios referenciales de detal y mayor con desglose de IVA"
          className="mt-[2px] w-full table-fixed border-collapse text-right text-[7.5px] leading-[1.15] text-black tabular-nums [&_td]:whitespace-nowrap [&_td]:py-[2px] [&_th]:whitespace-nowrap [&_th]:py-[2px] [&_th]:font-semibold"
        >
          <thead className="border-b-[0.6px] border-black text-[6.5px]">
            <tr>
              <th className="w-[41%] text-left">REF</th>
              <th scope="col">DETAL</th>
              <th scope="col">MAYOR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="text-left">
                Sin IVA
              </th>
              {prices.map((price, i) => (
                <td key={i} style={{ fontSize: amountFontSize }}>
                  {LABEL_PRICE_FORMAT.format(price.base)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-left">
                + IVA {TAX_RATE * 100} %
              </th>
              {prices.map((price, i) => (
                <td key={i} style={{ fontSize: amountFontSize }}>
                  {LABEL_PRICE_FORMAT.format(price.tax)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-black text-[9.5px] font-extrabold">
              <th scope="row" className="text-left text-[6.8px]">
                TOTAL
              </th>
              {prices.map((price, i) => (
                <td key={i} style={{ fontSize: totalFontSize }}>
                  {LABEL_PRICE_FORMAT.format(price.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabelsPage() {
  return (
    <AdminShell title="Generador e impresor de etiquetas">
      <style>{LABEL_PRINT_STYLE}</style>
      <Tabs defaultValue="products" className="print:contents">
        <TabsList className="print:hidden">
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4 print:contents">
          <ProductLabelsPanel />
        </TabsContent>
        <TabsContent value="groups" className="mt-4 print:contents">
          <ProductGroupsPanel />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function ProductLabelsPanel() {
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [format, setFormat] = useState<LabelFormat>("precio");
  const { data: allProducts, isLoading } = useAdminProducts();
  const { data: suppliers, isError: suppliersError, refetch: refetchSuppliers } = useSuppliers();
  const supplierNames = useMemo(
    () => new Map(suppliers?.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  // Every word, in any order: "18w panel" finds "Panel LED 18W".
  const products = useMemo(
    () => (allProducts ?? []).filter((p) => matchesWords(search, p.name, p.sku, p.model)),
    [allProducts, search],
  );
  const pickerPage = usePagination(products, PICKER_PAGE_SIZE, search);

  const selectedIds = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id]) => id);
  const totalLabels = selectedIds.reduce((s, id) => s + (quantities[id] ?? 0), 0);

  const { data: labels, isFetching: qrLabelsLoading } = useQrLabels(selectedIds);
  const suppliersRequired =
    format === "precio" &&
    allProducts?.some((product) => (quantities[product.id] ?? 0) > 0 && product.supplierId);
  const supplierDataPending = suppliersRequired && !suppliers;
  const labelsLoading = qrLabelsLoading || (supplierDataPending && !suppliersError);

  // Every selected product, not only those matching the current search —
  // searching for the next product mustn't drop earlier picks from the print.
  const printItems = (allProducts ?? [])
    .filter((p) => (quantities[p.id] ?? 0) > 0)
    .flatMap((p) => {
      const label = labels?.find((l) => l.productId === p.id);
      if (!label || supplierDataPending) return [];
      return Array.from({ length: quantities[p.id] }, (_, i) => ({
        ...label,
        supplierName: p.supplierId ? supplierNames.get(p.supplierId) : undefined,
        key: `${p.id}-${i}`,
      }));
    });

  const setQty = (id: string, qty: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const activeFormat = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const previewTop = useRef<HTMLDivElement>(null);
  const canPrint = totalLabels > 0 && !labelsLoading && printItems.length === totalLabels;

  return (
    <>
      {/* grid-cols-1: one shrinkable column, or a long product name widens
          the page past a phone's screen. The bottom padding leaves room for
          the phone's print bar. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)] print:contents",
          totalLabels > 0 && "pb-20 lg:pb-0 print:pb-0",
        )}
      >
        <Card className="p-4 sm:p-6 print:hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-brand-navy">Seleccionar productos</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuantities({})}
              disabled={selectedIds.length === 0}
            >
              Limpiar
            </Button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, SKU o código de barra…"
              className="pl-8"
            />
          </div>

          {/* Its own scroll only beside the preview: on a phone it flows
              with the page instead of trapping the finger. */}
          <div className="mt-3 space-y-2 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            )}
            {!isLoading && products.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay productos con este filtro.
              </div>
            )}
            {pickerPage.pageItems.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-brand-surface"
              >
                <div className="min-w-0 flex-1">
                  {/* Two lines: names often differ only at the end (5W, 6W…). */}
                  <div className="line-clamp-2 break-words text-sm font-semibold leading-snug text-brand-navy">
                    {p.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{p.model}</div>
                </div>
                <QuantityStepper
                  qty={quantities[p.id] ?? 0}
                  onChange={(qty) => setQty(p.id, qty)}
                  size="sm"
                  showIcon={false}
                />
              </div>
            ))}
          </div>
          <PaginationBar
            className="mt-3"
            page={pickerPage.page}
            totalPages={pickerPage.totalPages}
            onChange={pickerPage.setPage}
            from={pickerPage.from}
            to={pickerPage.to}
            total={pickerPage.total}
          />
        </Card>

        <div ref={previewTop} className="scroll-mt-20 print:contents">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 print:hidden">
            <h3 className="text-base font-semibold text-brand-navy">
              Vista previa · {totalLabels} etiqueta{totalLabels === 1 ? "" : "s"}
            </h3>
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              onClick={() => window.print()}
              disabled={!canPrint}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <p className="basis-full text-xs text-muted-foreground">
              Etiquetas de 5×3cm para impresora Xprinter XP-D4601B. {activeFormat.hint}
            </p>
          </div>

          <div className="mt-4 flex gap-1 rounded-md border border-border p-1 print:hidden">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={cn(
                  "flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                  format === opt.value
                    ? "bg-brand-blue text-white"
                    : "text-muted-foreground hover:bg-brand-surface",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-3 print:mt-0 print:block print:justify-start">
            {totalLabels === 0 && (
              <Card className="flex w-full flex-col items-center gap-2 p-10 text-center text-muted-foreground print:hidden">
                <QrCode className="h-10 w-10" />
                Selecciona productos y una cantidad para generar sus etiquetas.
              </Card>
            )}
            {totalLabels > 0 && labelsLoading && (
              <div className="flex w-full items-center justify-center gap-2 py-16 text-sm text-muted-foreground print:hidden">
                <Loader2 className="h-4 w-4 animate-spin" /> Generando etiquetas…
              </div>
            )}
            {supplierDataPending && suppliersError && (
              <div
                role="alert"
                className="flex w-full flex-col items-center gap-3 py-8 text-center text-sm print:hidden"
              >
                <p>No se pudieron cargar los proveedores para las etiquetas de precio.</p>
                <Button variant="outline" onClick={() => void refetchSuppliers()}>
                  Reintentar
                </Button>
              </div>
            )}
            {printItems.map((label) => (
              <LabelCard key={label.key} label={label} format={format} />
            ))}
          </div>
        </div>
      </div>

      {/* On a phone the preview and its button sit below the whole product
          list: this keeps both a tap away while picking. */}
      {totalLabels > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur lg:hidden print:hidden">
          <div className="flex items-center gap-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            <div className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-brand-navy">
              {totalLabels} etiqueta{totalLabels === 1 ? "" : "s"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => previewTop.current?.scrollIntoView({ behavior: "smooth" })}
            >
              Ver
            </Button>
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              onClick={() => window.print()}
              disabled={!canPrint}
            >
              {labelsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Imprimir
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
