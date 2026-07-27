import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DollarSign, ShoppingBag, AlertTriangle, TrendingUp } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Admin Electron Plus" },
      { name: "description", content: "Ventas, compras, categorías y alertas operativas." },
      { property: "og:title", content: "Dashboard · Electron Plus" },
      { property: "og:description", content: "Analítica y reportes en tiempo real." },
    ],
  }),
  component: AdminDashboard,
});

const COLORS = ["#0056b3", "#ffb703", "#0b2545", "#4aa3df", "#e85d3a"];

interface SalesSeriesPoint {
  month: string;
  ventas: number;
  compras: number;
}

interface CategoryShareSlice {
  name: string;
  value: number;
}

interface ProfitabilityRow {
  productId: string;
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
  margin: number;
}

interface AdminOrderSummary {
  id: string;
  status: string;
}

interface AdminProductSummary {
  id: string;
  stock: number;
  minStockThreshold?: number;
}

function trendPct(current?: number, previous?: number): number | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function truncate(name: string, max = 16): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function AdminDashboard() {
  const { data: salesSeries = [] } = useQuery({
    queryKey: ["reports", "sales-series"],
    queryFn: () => apiFetch<SalesSeriesPoint[]>("/reports/sales-series"),
  });
  const { data: categoryShare = [] } = useQuery({
    queryKey: ["reports", "category-share"],
    queryFn: () => apiFetch<CategoryShareSlice[]>("/reports/category-share"),
  });
  const { data: profitability = [] } = useQuery({
    queryKey: ["reports", "profitability"],
    queryFn: () => apiFetch<ProfitabilityRow[]>("/reports/profitability"),
  });
  // Shared queryKey with admin.orders.tsx — same GET /orders.
  const { data: orders = [] } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => apiFetch<AdminOrderSummary[]>("/orders"),
  });
  // Shared queryKey with admin.stock.tsx / admin.suppliers.tsx / the default
  // (no search) state of admin.inventory.tsx and admin.labels.tsx — all hit
  // the same unfiltered GET /products/admin.
  const { data: products = [] } = useQuery({
    queryKey: ["admin", "products", ""],
    queryFn: () => apiFetch<AdminProductSummary[]>("/products/admin"),
  });

  const lastMonth = salesSeries[salesSeries.length - 1];
  const prevMonth = salesSeries[salesSeries.length - 2];
  const totalSales = lastMonth?.ventas ?? 0;
  const totalPurchases = lastMonth?.compras ?? 0;
  const salesTrend = trendPct(lastMonth?.ventas, prevMonth?.ventas);
  const purchasesTrend = trendPct(lastMonth?.compras, prevMonth?.compras);

  const pendingOrders = orders.filter((o) => o.status === "pending_payment_verification").length;
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const lowStock = products.filter(
    (p) => (p.minStockThreshold ?? 0) > 0 && p.stock > 0 && p.stock <= p.minStockThreshold!,
  ).length;

  const topProducts = profitability.slice(0, 6).map((p) => ({ ...p, label: truncate(p.name) }));

  return (
    <AdminShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={DollarSign}
          label="Ventas del mes"
          value={formatMoney(totalSales)}
          trend={
            salesTrend === null
              ? "Sin datos del mes anterior"
              : `${salesTrend >= 0 ? "+" : ""}${salesTrend}% vs. mes anterior`
          }
        />
        <Kpi
          icon={ShoppingBag}
          label="Pedidos"
          value={orders.length.toString()}
          trend={
            pendingOrders > 0
              ? `${pendingOrders} pendientes de verificación`
              : "Sin pagos pendientes por verificar"
          }
          warn={pendingOrders > 0}
        />
        <Kpi
          icon={TrendingUp}
          label="Compras del mes"
          value={formatMoney(totalPurchases)}
          trend={
            purchasesTrend === null
              ? "Sin datos del mes anterior"
              : `${purchasesTrend >= 0 ? "+" : ""}${purchasesTrend}% vs. mes anterior`
          }
        />
        <Kpi
          icon={AlertTriangle}
          label="Alertas de stock"
          value={(outOfStock + lowStock).toString()}
          trend={`${outOfStock} agotados · ${lowStock} bajos`}
          warn={outOfStock + lowStock > 0}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Rendimiento
          </div>
          <h3 className="text-lg font-semibold text-brand-navy">Ventas vs. compras</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="#0056b3"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="compras"
                  stroke="#ffb703"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Participación
          </div>
          <h3 className="text-lg font-semibold text-brand-navy">Ventas por categoría</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryShare}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                >
                  {categoryShare.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Rentabilidad · último mes
        </div>
        <h3 className="text-lg font-semibold text-brand-navy">Productos más rentables</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProducts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip formatter={(value: number) => formatMoney(value)} />
              <Legend />
              <Bar dataKey="revenue" name="Ingresos" fill="#0056b3" radius={[6, 6, 0, 0]} />
              <Bar dataKey="margin" name="Margen" fill="#ffb703" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {topProducts.length === 0 && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Aún no hay ventas registradas en el último mes.
          </p>
        )}
      </Card>
    </AdminShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  trend,
  warn,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  trend: string;
  warn?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold text-brand-navy">{value}</div>
        </div>
        <div
          className={`grid h-10 w-10 place-items-center rounded-md ${
            warn ? "bg-destructive/10 text-destructive" : "bg-brand-blue/10 text-brand-blue"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className={`mt-3 text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>
        {trend}
      </div>
    </Card>
  );
}
