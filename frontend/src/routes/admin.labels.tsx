import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer, QrCode } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { ElectronLogo } from "@/components/electron-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QrBlock } from "@/components/qr-block";
import { PRODUCTS } from "@/lib/mock-data";
import { formatMoney } from "@/lib/electron-store";

export const Route = createFileRoute("/admin/labels")({
  head: () => ({
    meta: [
      { title: "Etiquetas QR · Admin Electron Plus" },
      {
        name: "description",
        content: "Genera e imprime etiquetas con nombre, precio y código QR.",
      },
      { property: "og:title", content: "Etiquetas QR · Electron Plus" },
      { property: "og:description", content: "Etiquetas imprimibles para tienda y depósito." },
    ],
  }),
  component: LabelsPage,
});

function LabelsPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = PRODUCTS.filter((p) => selected.has(p.id));

  return (
    <AdminShell title="Generador e impresor de etiquetas QR">
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-brand-navy">Seleccionar productos</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected((s) =>
                  s.size === PRODUCTS.length ? new Set() : new Set(PRODUCTS.map((p) => p.id)),
                )
              }
            >
              {selected.size === PRODUCTS.length ? "Ninguno" : "Todos"}
            </Button>
          </div>
          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {PRODUCTS.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-brand-surface"
              >
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <img src={p.image} alt="" className="h-10 w-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-brand-navy">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                </div>
                <div className="text-xs font-semibold text-brand-blue">
                  {formatMoney(p.retailPrice)}
                </div>
              </label>
            ))}
          </div>
        </Card>

        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div>
              <h3 className="text-base font-semibold text-brand-navy">
                Vista previa · {chosen.length} etiquetas
              </h3>
              <p className="text-xs text-muted-foreground">
                Escanea el QR para abrir la ficha pública del producto.
              </p>
            </div>
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              onClick={() => window.print()}
              disabled={chosen.length === 0}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {chosen.length === 0 && (
              <Card className="col-span-full flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <QrCode className="h-10 w-10" />
                Selecciona productos para generar sus etiquetas.
              </Card>
            )}
            {chosen.map((p) => (
              <div
                key={p.id}
                className="rounded-md border-2 border-dashed border-brand-navy/30 bg-white p-3"
              >
                <ElectronLogo layout="isotype" tone="color" className="h-4" />

                <div className="mt-1 line-clamp-2 min-h-10 text-sm font-bold text-brand-navy">
                  {p.name}
                </div>
                <div className="text-[10px] text-muted-foreground">{p.sku}</div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Precio</div>
                    <div className="text-xl font-extrabold text-brand-navy">
                      {formatMoney(p.retailPrice)}
                    </div>
                  </div>
                  <QrBlock seed={`electron-plus:${p.id}`} size={80} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
