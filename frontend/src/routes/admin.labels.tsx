import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Printer, QrCode, Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { ElectronLogo } from "@/components/electron-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/quantity-stepper";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";

export const Route = createFileRoute("/admin/labels")({
  head: () => ({
    meta: [
      { title: "Etiquetas QR · Admin Electron Plus" },
      {
        name: "description",
        content: "Genera e imprime etiquetas con código QR real para cada producto.",
      },
      { property: "og:title", content: "Etiquetas QR · Electron Plus" },
      { property: "og:description", content: "Etiquetas imprimibles para tienda y depósito." },
    ],
  }),
  component: LabelsPage,
});

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
}

interface QrLabel {
  productId: string;
  sku: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  qrImageDataUrl: string;
}

function useAdminProducts(search: string) {
  return useQuery({
    queryKey: ["admin", "products", search],
    queryFn: () =>
      apiFetch<AdminProduct[]>(
        `/products/admin${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

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
    @page { size: 50mm 30mm landscape; margin: 0; }
    html, body { margin: 0; padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .qr-label { width: 50mm; height: 30mm; page-break-inside: avoid; }
  @media print {
    .qr-label { break-after: page; page-break-after: always; }
    .qr-label:last-child { break-after: auto; page-break-after: auto; }
  }
`;

function LabelsPage() {
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { data: products, isLoading } = useAdminProducts(search);

  const selectedIds = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id]) => id);
  const totalLabels = selectedIds.reduce((s, id) => s + (quantities[id] ?? 0), 0);

  const { data: labels, isFetching: labelsLoading } = useQrLabels(selectedIds);

  const printItems = (products ?? [])
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

  return (
    <AdminShell title="Generador e impresor de etiquetas QR">
      <style>{LABEL_PRINT_STYLE}</style>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] print:contents">
        <Card className="p-6 print:hidden">
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
              placeholder="Nombre o SKU…"
              className="pl-8"
            />
          </div>

          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            )}
            {!isLoading && (products?.length ?? 0) === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay productos con este filtro.
              </div>
            )}
            {products?.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-brand-surface"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-navy">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
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
        </Card>

        <div className="print:contents">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 print:hidden">
            <div>
              <h3 className="text-base font-semibold text-brand-navy">
                Vista previa · {totalLabels} etiqueta{totalLabels === 1 ? "" : "s"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Etiquetas de 5×3cm para impresora Xprinter XP-D4601B. Escanea el QR para abrir la
                ficha del producto.
              </p>
            </div>
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              onClick={() => window.print()}
              disabled={totalLabels === 0 || labelsLoading}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
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
                <Loader2 className="h-4 w-4 animate-spin" /> Generando códigos QR…
              </div>
            )}
            {printItems.map((label) => (
              <div
                key={label.key}
                className="qr-label flex items-center gap-1.5 overflow-hidden border border-dashed border-brand-navy/30 bg-white p-1.5 print:border-none"
              >
                <img
                  src={label.qrImageDataUrl}
                  alt=""
                  className="h-[20mm] w-[20mm] shrink-0 object-contain"
                />
                <div className="flex h-full min-w-0 flex-1 flex-col justify-between py-[1px]">
                  <ElectronLogo
                    layout="wordmark"
                    tone="black"
                    className="h-[3mm] w-auto shrink-0"
                  />
                  <div className="line-clamp-1 text-[9.5px] font-bold leading-tight text-black">
                    {label.name}
                  </div>
                  <div className="font-mono text-[8px] leading-tight text-black">{label.sku}</div>
                  <div className="flex gap-[2px]">
                    <div className="flex-1 rounded-[1px] border border-black px-[2px] py-[1.5px] text-center leading-none">
                      <div className="text-[5.5px] font-semibold uppercase tracking-wide text-black">
                        Detal
                      </div>
                      <div className="text-[10px] font-bold leading-tight text-black">
                        {formatMoney(label.retailPrice)}
                      </div>
                    </div>
                    <div className="flex-1 rounded-[1px] border border-black px-[2px] py-[1.5px] text-center leading-none">
                      <div className="text-[5.5px] font-semibold uppercase tracking-wide text-black">
                        Mayor
                      </div>
                      <div className="text-[10px] font-bold leading-tight text-black">
                        {formatMoney(label.wholesalePrice)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[6px] leading-tight text-black/60">IVA no incluido</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
