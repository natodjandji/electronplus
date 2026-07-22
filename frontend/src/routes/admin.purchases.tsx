import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SUPPLIER_INVOICES } from "@/lib/mock-data";
import { formatMoney } from "@/lib/electron-store";

export const Route = createFileRoute("/admin/purchases")({
  head: () => ({
    meta: [
      { title: "Compras · Admin Electron Plus" },
      { name: "description", content: "Control de facturas de proveedores y pagos con alertas de vencimiento." },
      { property: "og:title", content: "Compras · Electron Plus Admin" },
      { property: "og:description", content: "Facturas por vencer y pagos a proveedores." },
    ],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const vencidas = SUPPLIER_INVOICES.filter((f) => f.status === "vencida");
  const porVencer = SUPPLIER_INVOICES.filter((f) => f.status === "por-vencer");

  return (
    <AdminShell title="Compras & vencimiento de facturas">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard tone="destructive" icon={AlertCircle} label="Vencidas" count={vencidas.length} amount={sum(vencidas)} />
        <SummaryCard tone="warning" icon={Clock} label="Por vencer" count={porVencer.length} amount={sum(porVencer)} />
        <SummaryCard
          tone="ok"
          icon={CheckCircle2}
          label="Vigentes"
          count={SUPPLIER_INVOICES.length - vencidas.length - porVencer.length}
          amount={sum(SUPPLIER_INVOICES.filter((f) => f.status === "vigente"))}
        />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="text-base font-semibold text-brand-navy">Facturas de proveedores</h3>
          <p className="text-xs text-muted-foreground">
            Ordenadas por criticidad. Registra los pagos para actualizar el estado.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Factura</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2">Vencimiento</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {SUPPLIER_INVOICES.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-brand-navy">{f.id}</td>
                  <td className="px-4 py-3">{f.supplier}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(f.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {f.dueInDays < 0 ? `Vencida hace ${Math.abs(f.dueInDays)} días` : `En ${f.dueInDays} días`}
                  </td>
                  <td className="px-4 py-3">
                    {f.status === "vencida" && <Badge className="bg-destructive text-white">Vencida</Badge>}
                    {f.status === "por-vencer" && (
                      <Badge className="bg-brand-yellow text-brand-navy">Por vencer</Badge>
                    )}
                    {f.status === "vigente" && (
                      <Badge className="bg-brand-blue/10 text-brand-blue">Vigente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline">
                      Registrar pago
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  );
}

function sum(arr: typeof SUPPLIER_INVOICES) {
  return arr.reduce((s, i) => s + i.amount, 0);
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  count,
  amount,
}: {
  tone: "destructive" | "warning" | "ok";
  icon: typeof AlertCircle;
  label: string;
  count: number;
  amount: number;
}) {
  const toneMap = {
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-brand-yellow/25 text-brand-navy",
    ok: "bg-brand-blue/10 text-brand-blue",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold text-brand-navy">{count}</div>
          <div className="text-sm text-muted-foreground">{formatMoney(amount)}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-md ${toneMap}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
