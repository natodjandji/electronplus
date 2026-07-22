import { createFileRoute } from "@tanstack/react-router";
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
import { CATEGORY_SHARE, PRODUCTS, SALES_SERIES } from "@/lib/mock-data";
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

function AdminDashboard() {
  const totalSales = SALES_SERIES.reduce((s, r) => s + r.ventas, 0);
  const totalPurchases = SALES_SERIES.reduce((s, r) => s + r.compras, 0);
  const lowStock = PRODUCTS.filter((p) => p.stock > 0 && p.stock <= 10).length;
  const orders = 342;

  return (
    <AdminShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={DollarSign} label="Ventas del período" value={formatMoney(totalSales)} trend="+18% vs. mes anterior" />
        <Kpi icon={ShoppingBag} label="Pedidos" value={orders.toString()} trend="+7% vs. mes anterior" />
        <Kpi icon={TrendingUp} label="Compras" value={formatMoney(totalPurchases)} trend="Bajo control" />
        <Kpi
          icon={AlertTriangle}
          label="Alertas de stock"
          value={lowStock.toString()}
          trend={`${lowStock} productos por reponer`}
          warn
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Rendimiento
              </div>
              <h3 className="text-lg font-semibold text-brand-navy">Ventas vs. compras</h3>
            </div>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={SALES_SERIES}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ventas" stroke="#0056b3" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="compras" stroke="#ffb703" strokeWidth={2.5} dot={{ r: 3 }} />
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
                <Pie data={CATEGORY_SHARE} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {CATEGORY_SHARE.map((_, i) => (
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
          Comparativo mensual
        </div>
        <h3 className="text-lg font-semibold text-brand-navy">Volumen por mes</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SALES_SERIES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="ventas" fill="#0056b3" radius={[6, 6, 0, 0]} />
              <Bar dataKey="compras" fill="#0b2545" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
      <div className={`mt-3 text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>{trend}</div>
    </Card>
  );
}
