import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TableRowsSkeleton } from "@/components/table-skeleton";
import { apiFetch, reportError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/expenses")({
  head: () => ({
    meta: [
      { title: "Gastos · Admin Electron Plus" },
      {
        name: "description",
        content: "Control de gastos del local, incluyendo pagos mensuales y anuales.",
      },
      { property: "og:title", content: "Gastos · Electron Plus Admin" },
      { property: "og:description", content: "Gastos fijos y variables del local." },
    ],
  }),
  component: ExpensesPage,
});

type ExpenseFrequency = "once" | "monthly" | "annual";
type ExpenseStatus = "pending" | "paid";
type DueStatus = "current" | "due_soon" | "overdue";

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: ExpenseFrequency;
  dueDate: string;
  status: ExpenseStatus;
  dueStatus: DueStatus;
  lastPaidAt?: string;
  notes?: string;
  active: boolean;
}

const FREQUENCY_LABEL: Record<ExpenseFrequency, string> = {
  once: "Único",
  monthly: "Mensual",
  annual: "Anual",
};

const DUE_LABEL: Record<DueStatus, string> = {
  overdue: "Vencido",
  due_soon: "Por vencer",
  current: "Vigente",
};

const DUE_BADGE: Record<DueStatus, string> = {
  overdue: "bg-destructive text-white",
  due_soon: "bg-brand-yellow text-brand-navy",
  current: "bg-brand-blue/10 text-brand-blue",
};

const CATEGORY_OPTIONS = [
  "Alquiler",
  "Servicios (luz, agua, internet)",
  "Nómina",
  "Seguros",
  "Impuestos",
  "Mantenimiento",
  "Suscripciones",
  "Otros",
];

function useExpenses() {
  return useQuery({
    queryKey: ["admin", "expenses"],
    queryFn: () => apiFetch<Expense[]>("/expenses"),
  });
}

function sum(arr: Expense[]) {
  return arr.reduce((s, e) => s + e.amount, 0);
}

function ExpensesPage() {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("all");
  const { data: expenses, isLoading } = useExpenses();

  const all = expenses ?? [];
  const activePending = all.filter((e) => e.active && e.status === "pending");
  const overdue = activePending.filter((e) => e.dueStatus === "overdue");
  const dueSoon = activePending.filter((e) => e.dueStatus === "due_soon");
  const current = activePending.filter((e) => e.dueStatus === "current");

  const categories = Array.from(new Set(all.map((e) => e.category))).sort();
  const needle = search.trim().toLowerCase();
  const visible = all
    .filter((e) => statusFilter === "all" || e.status === statusFilter)
    .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
    .filter((e) => !needle || e.name.toLowerCase().includes(needle));

  return (
    <AdminShell title="Control de gastos del local">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Estado</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | ExpenseStatus)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre del gasto…"
                className="w-56 pl-8"
              />
            </div>
          </div>
        </div>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo gasto
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Los resúmenes de vencidos/por vencer/vigentes consideran solo los gastos activos y
        pendientes de pago.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SummaryCard
          tone="destructive"
          icon={AlertCircle}
          label="Vencidos"
          count={overdue.length}
          amount={sum(overdue)}
        />
        <SummaryCard
          tone="warning"
          icon={Clock}
          label="Por vencer"
          count={dueSoon.length}
          amount={sum(dueSoon)}
        />
        <SummaryCard
          tone="ok"
          icon={CheckCircle2}
          label="Vigentes"
          count={current.length}
          amount={sum(current)}
        />
      </div>

      {isLoading && (
        <Card className="mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <TableRowsSkeleton columns={6} rows={4} />
            </tbody>
          </table>
        </Card>
      )}

      {!isLoading && all.length === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          No hay gastos registrados todavía.
        </Card>
      )}

      {!isLoading && all.length > 0 && visible.length === 0 && (
        <Card className="mt-6 p-10 text-center text-muted-foreground">
          No hay gastos que coincidan con estos filtros.
        </Card>
      )}

      {visible.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-brand-surface">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Gasto</th>
                  <th className="px-4 py-2">Categoría</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2">Frecuencia</th>
                  <th className="px-4 py-2">Próximo vencimiento</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...visible]
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map((e) => (
                    <tr
                      key={e.id}
                      className={`cursor-pointer border-t border-border hover:bg-brand-surface ${!e.active ? "opacity-50" : ""}`}
                      onClick={() => setEditingId(e.id)}
                    >
                      <td className="px-4 py-3 font-semibold text-brand-navy">{e.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(e.amount)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          {e.frequency !== "once" && <Repeat className="h-3.5 w-3.5" />}
                          {FREQUENCY_LABEL[e.frequency]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(e.dueDate).toLocaleDateString("es-VE")}
                      </td>
                      <td className="px-4 py-3">
                        {e.status === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Pagado</Badge>
                        ) : (
                          <Badge className={DUE_BADGE[e.dueStatus]}>{DUE_LABEL[e.dueStatus]}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <CreateExpenseDialog onClose={() => setCreating(false)} />}
      {editingId && (
        <EditExpenseDialog
          expense={all.find((e) => e.id === editingId)!}
          onClose={() => setEditingId(null)}
        />
      )}
    </AdminShell>
  );
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

function CreateExpenseDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [amount, setAmount] = useState(0);
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Expense>("/expenses", {
        method: "POST",
        body: { name, category, amount, frequency, dueDate, notes: notes || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "expenses"] });
      toast.success("Gasto registrado");
      onClose();
    },
    onError: reportError,
  });

  const canSave = name.trim() && category && amount > 0 && dueDate;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Nombre del gasto</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Alquiler del local"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Monto (USD)</Label>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Frecuencia</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as ExpenseFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Único</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              {frequency === "once" ? "Fecha de pago" : "Próximo vencimiento"}
            </Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Notas</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionales…"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            Guardar gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(expense.name);
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState(expense.amount);
  const [frequency, setFrequency] = useState<ExpenseFrequency>(expense.frequency);
  const [dueDate, setDueDate] = useState(expense.dueDate);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [active, setActive] = useState(expense.active);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "expenses"] });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/expenses/${expense.id}`, {
        method: "PATCH",
        body: { name, category, amount, frequency, dueDate, notes: notes || undefined, active },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Gasto actualizado");
      onClose();
    },
    onError: reportError,
  });

  const markPaid = useMutation({
    mutationFn: () => apiFetch(`/expenses/${expense.id}/pay`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast.success(
        expense.frequency === "once"
          ? "Gasto marcado como pagado"
          : "Pago registrado — próxima fecha actualizada",
      );
      onClose();
    },
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/expenses/${expense.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success("Gasto eliminado");
      onClose();
    },
    onError: reportError,
  });

  const canSave = name.trim() && category && amount > 0 && dueDate;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar gasto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-brand-navy">Nombre del gasto</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...CATEGORY_OPTIONS, category])).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Monto (USD)</Label>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Frecuencia</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as ExpenseFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Único</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Próximo vencimiento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-navy">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Activo (los gastos recurrentes inactivos no generan alertas ni aparecen en los resúmenes)
        </label>

        {expense.lastPaidAt && (
          <p className="text-xs text-muted-foreground">
            Último pago registrado: {new Date(expense.lastPaidAt).toLocaleDateString("es-VE")}
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
            {expense.status !== "paid" && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => markPaid.mutate()}
                disabled={markPaid.isPending}
              >
                {markPaid.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Marcar como pagado
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
              disabled={!canSave || save.isPending}
              onClick={() => save.mutate()}
            >
              <Pencil className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
