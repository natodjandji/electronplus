import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatMoneyAdmin } from "@/lib/electron-store";
import { formatCalendarDate } from "@/lib/format";
import { toast } from "sonner";

type DiscountType = "percentage" | "fixed";

interface DiscountCode {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  enabled: boolean;
  /** Last valid day, YYYY-MM-DD (Venezuela time). */
  expiresOn?: string | null;
  maxUses?: number | null;
  usedCount?: number;
  oncePerCustomer?: boolean;
}

/** Today as the API judges expiry: in Venezuela, whatever the browser's zone. */
function todayInVenezuela(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
}

type CodeStatus = { label: string; className: string };

function statusOf(d: DiscountCode): CodeStatus {
  if (!d.enabled) return { label: "Inactivo", className: "bg-muted text-muted-foreground" };
  if (d.expiresOn && d.expiresOn < todayInVenezuela()) {
    return { label: "Vencido", className: "bg-amber-100 text-amber-800" };
  }
  if (d.maxUses != null && (d.usedCount ?? 0) >= d.maxUses) {
    return { label: "Agotado", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Activo", className: "bg-emerald-100 text-emerald-800" };
}

function useDiscountCodes() {
  return useQuery({
    queryKey: ["admin", "discount-codes"],
    queryFn: () => apiFetch<DiscountCode[]>("/discount-codes"),
  });
}

function valueLabel(d: Pick<DiscountCode, "type" | "value">): string {
  return d.type === "percentage" ? `${d.value}%` : formatMoneyAdmin(d.value);
}

export function DiscountCodesPanel() {
  const { data: codes, isLoading } = useDiscountCodes();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [deleting, setDeleting] = useState<DiscountCode | null>(null);
  const queryClient = useQueryClient();

  const toggleEnabled = useMutation({
    mutationFn: (d: DiscountCode) =>
      apiFetch(`/discount-codes/${d.id}`, { method: "PATCH", body: { enabled: !d.enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "discount-codes"] }),
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/discount-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "discount-codes"] });
      toast.success("Código eliminado");
      setDeleting(null);
    },
    onError: reportError,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Crea códigos que tus clientes puedan aplicar en el carrito — porcentaje o monto fijo sobre
          el subtotal.
        </p>
        <Button
          className="shrink-0 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo código
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Descuento</th>
                <th className="px-4 py-2">Usos</th>
                <th className="px-4 py-2">Vence</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && (codes?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No hay códigos de descuento creados.
                  </td>
                </tr>
              )}
              {codes?.map((d) => {
                const status = statusOf(d);
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono font-semibold text-brand-navy">{d.code}</td>
                    <td className="px-4 py-3 text-brand-navy">{valueLabel(d)}</td>
                    <td className="px-4 py-3 tabular-nums text-brand-navy">
                      {d.usedCount ?? 0}
                      <span className="text-muted-foreground"> / {d.maxUses ?? "∞"}</span>
                      {d.oncePerCustomer && (
                        <div className="text-xs text-muted-foreground">1 por cliente</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-navy">
                      {d.expiresOn ? (
                        formatCalendarDate(d.expiresOn)
                      ) : (
                        <span className="text-muted-foreground">Sin vencimiento</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleEnabled.mutate(d)}
                        disabled={toggleEnabled.isPending}
                        aria-label={d.enabled ? `Desactivar ${d.code}` : `Activar ${d.code}`}
                      >
                        <Badge className={status.className}>{status.label}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => setEditing(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleting(d)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && <CreateCodeDialog onClose={() => setCreating(false)} />}
      {editing && <EditCodeDialog code={editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar el código {deleting?.code}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateCodeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState(10);
  const [limits, setLimits] = useState<LimitsDraft>({
    maxUses: "",
    expiresOn: "",
    oncePerCustomer: false,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/discount-codes", {
        method: "POST",
        body: { code, type, value, ...limitsBody(limits) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "discount-codes"] });
      toast.success("Código creado");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo código de descuento</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Código</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENIDA10"
              className="font-mono"
            />
          </Field>
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                <SelectItem value="fixed">Monto fijo ($)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Valor {type === "percentage" ? "(%)" : "($)"}
            </Label>
            <Input
              type="number"
              min={0}
              max={type === "percentage" ? 100 : undefined}
              step={type === "percentage" ? 1 : 0.01}
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <LimitsFields limits={limits} onChange={setLimits} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!code.trim() || !limitsValid(limits) || create.isPending}
            onClick={() => create.mutate()}
          >
            Crear código
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCodeDialog({ code, onClose }: { code: DiscountCode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<DiscountType>(code.type);
  const [value, setValue] = useState(code.value);
  const [enabled, setEnabled] = useState(code.enabled);
  const [limits, setLimits] = useState<LimitsDraft>({
    maxUses: code.maxUses != null ? String(code.maxUses) : "",
    expiresOn: code.expiresOn ?? "",
    oncePerCustomer: code.oncePerCustomer ?? false,
  });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/discount-codes/${code.id}`, {
        method: "PATCH",
        body: { type, value, enabled, ...limitsBody(limits) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "discount-codes"] });
      toast.success("Código actualizado");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar {code.code}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                <SelectItem value="fixed">Monto fijo ($)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Valor {type === "percentage" ? "(%)" : "($)"}
            </Label>
            <Input
              type="number"
              min={0}
              max={type === "percentage" ? 100 : undefined}
              step={type === "percentage" ? 1 : 0.01}
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <LimitsFields limits={limits} onChange={setLimits} usedCount={code.usedCount ?? 0} />
          <Field className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Activo</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!limitsValid(limits) || save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Form state for the optional limits — empty strings mean "none". */
interface LimitsDraft {
  maxUses: string;
  expiresOn: string;
  oncePerCustomer: boolean;
}

function limitsValid(limits: LimitsDraft): boolean {
  return (
    limits.maxUses === "" ||
    (Number.isInteger(Number(limits.maxUses)) && Number(limits.maxUses) >= 1)
  );
}

/** Empty fields go as null, which clears a limit set before. */
function limitsBody(limits: LimitsDraft) {
  return {
    maxUses: limits.maxUses === "" ? null : Number(limits.maxUses),
    expiresOn: limits.expiresOn || null,
    oncePerCustomer: limits.oncePerCustomer,
  };
}

function LimitsFields({
  limits,
  onChange,
  usedCount,
}: {
  limits: LimitsDraft;
  onChange: (limits: LimitsDraft) => void;
  usedCount?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="grid gap-1.5">
        <Label className="text-xs font-medium text-brand-navy">Usos máximos</Label>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="Sin límite"
          value={limits.maxUses}
          onChange={(e) => onChange({ ...limits, maxUses: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {usedCount
            ? `Usado ${usedCount} ${usedCount === 1 ? "vez" : "veces"}`
            : "Vacío: sin límite"}
        </p>
      </Field>
      <Field className="grid gap-1.5">
        <Label className="text-xs font-medium text-brand-navy">Válido hasta</Label>
        <Input
          type="date"
          min={todayInVenezuela()}
          value={limits.expiresOn}
          onChange={(e) => onChange({ ...limits, expiresOn: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Vacío: no vence</p>
      </Field>
      <Field className="flex items-start justify-between gap-3 sm:col-span-2">
        <div className="grid gap-0.5">
          <Label className="text-sm text-brand-navy">Un uso por cliente</Label>
          <p className="text-xs text-muted-foreground">
            Cada cliente puede usarlo en un solo pedido. Si ese pedido se cancela, puede volver a
            usarlo.
          </p>
        </div>
        <Switch
          checked={limits.oncePerCustomer}
          onCheckedChange={(oncePerCustomer) => onChange({ ...limits, oncePerCustomer })}
        />
      </Field>
    </div>
  );
}
