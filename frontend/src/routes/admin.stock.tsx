import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, PackageX } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PRODUCTS } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/stock")({
  head: () => ({
    meta: [
      { title: "Alertas de stock · Admin Electron Plus" },
      { name: "description", content: "Detecta productos con stock bajo o agotado en tiempo real." },
      { property: "og:title", content: "Alertas de stock · Electron Plus" },
      { property: "og:description", content: "Prioriza reposiciones críticas." },
    ],
  }),
  component: StockPage,
});

function StockPage() {
  const critical = PRODUCTS.filter((p) => p.stock <= 10).sort((a, b) => a.stock - b.stock);
  const ok = PRODUCTS.filter((p) => p.stock > 10);

  return (
    <AdminShell title="Alertas de stock en tiempo real">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-destructive/15 text-destructive">
              <PackageX className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Agotados</div>
              <div className="text-2xl font-bold text-brand-navy">
                {PRODUCTS.filter((p) => p.stock === 0).length}
              </div>
            </div>
          </div>
        </Card>
        <Card className="border-brand-yellow/40 bg-brand-yellow/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-yellow/40 text-brand-navy">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Stock bajo (≤ 10)</div>
              <div className="text-2xl font-bold text-brand-navy">
                {PRODUCTS.filter((p) => p.stock > 0 && p.stock <= 10).length}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h3 className="text-base font-semibold text-brand-navy">Requiere atención</h3>
        <p className="text-xs text-muted-foreground">Productos con stock crítico o agotado.</p>
        <div className="mt-4 space-y-3">
          {critical.map((p) => {
            const pct = Math.min(100, (p.stock / 50) * 100);
            const out = p.stock === 0;
            return (
              <div key={p.id} className="flex items-center gap-4 rounded-md border border-border p-3">
                <img src={p.image} alt={p.name} className="h-14 w-14 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-brand-navy">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku} · {p.warehouse}
                      </div>
                    </div>
                    {out ? (
                      <Badge className="bg-destructive text-white">Agotado</Badge>
                    ) : (
                      <Badge className="bg-brand-yellow text-brand-navy">Stock bajo</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {p.stock} uds
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  Reponer
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h3 className="text-base font-semibold text-brand-navy">Inventario saludable</h3>
        <div className="mt-3 grid gap-2 text-sm">
          {ok.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
              <div>
                <div className="font-medium text-brand-navy">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.warehouse}</div>
              </div>
              <div className="text-sm font-semibold text-brand-blue">{p.stock} uds</div>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
