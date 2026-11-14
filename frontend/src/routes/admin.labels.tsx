import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Loader2, Printer, QrCode, Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { ProductGroupsPanel } from "@/components/admin/product-groups-panel";
import { PaginationBar, usePagination } from "@/components/pagination";
import { ElectronLogo } from "@/components/electron-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuantityStepper } from "@/components/quantity-stepper";
import { matchesWords } from "@/lib/product-search";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
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
    hint: "QR a la ficha del producto, nombre, SKU y precios detal/mayor.",
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

function LabelCard({ label, format }: { label: QrLabel & { key: string }; format: LabelFormat }) {
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

  return (
    <div className="qr-label flex items-center gap-1.5 overflow-hidden border border-dashed border-brand-blue/30 bg-white p-1.5 print:border-none">
      <img
        src={label.qrImageDataUrl}
        alt=""
        className="h-[17mm] w-[17mm] shrink-0 object-contain"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[1.5px]">
        {/* The SKU shares the logo's row, so the name gets a third line. The
            logo's letters stand on a line 63% down the image (the swoosh
            hangs below it): aligned to the top, the SKU stands on it too. */}
        <div className="flex items-start justify-between gap-1">
          <ElectronLogo layout="wordmark" tone="black" className="h-[2.8mm] w-auto shrink-0" />
          {label.model && (
            <span className="truncate text-[7.5px] font-semibold leading-none text-black">
              {label.model}
            </span>
          )}
        </div>
        <div className="line-clamp-3 text-[9.5px] font-bold leading-[1.1] text-black">
          {label.name}
        </div>
        <div className="mt-[1px] flex items-center justify-between gap-1 rounded-[1px] border border-black px-[3px] py-[1.5px] leading-none">
          <span className="text-[6px] font-semibold uppercase tracking-wide text-black">Detal</span>
          <span className="text-[10.5px] font-bold leading-tight text-black">
            {formatMoney(label.retailPrice)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 rounded-[1px] border border-black px-[3px] py-[1.5px] leading-none">
          <span className="text-[6px] font-semibold uppercase tracking-wide text-black">Mayor</span>
          <span className="text-[10.5px] font-bold leading-tight text-black">
            {formatMoney(label.wholesalePrice)}
          </span>
        </div>
        <div className="text-[7px] font-semibold leading-tight text-black">IVA no incluido</div>
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

  const { data: labels, isFetching: labelsLoading } = useQrLabels(selectedIds);

  // Every selected product, not only those matching the current search —
  // searching for the next product mustn't drop earlier picks from the print.
  const printItems = (allProducts ?? [])
    .filter((p) => (quantities[p.id] ?? 0) > 0)
    .flatMap((p) => {
      const label = labels?.find((l) => l.productId === p.id);
      if (!label) return [];
      return Array.from({ length: quantities[p.id] }, (_, i) => ({
        ...label,
        key: `${p.id}-${i}`,
      }));
    });

  const setQty = (id: string, qty: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const activeFormat = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const previewTop = useRef<HTMLDivElement>(null);
  const canPrint = totalLabels > 0 && !labelsLoading;

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
