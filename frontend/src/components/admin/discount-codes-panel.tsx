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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { toast } from "sonner";

type DiscountType = "percentage" | "fixed";

interface DiscountCode {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  enabled: boolean;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useDiscountCodes() {
  return useQuery({
    queryKey: ["admin", "discount-codes"],
    queryFn: () => apiFetch<DiscountCode[]>("/discount-codes"),
  });
}

function valueLabel(d: Pick<DiscountCode, "type" | "value">): string {
  return d.type === "percentage" ? `${d.value}%` : formatMoney(d.value);
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
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Descuento</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && (codes?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No hay códigos de descuento creados.
                  </td>
                </tr>
              )}
              {codes?.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-navy">{d.code}</td>
                  <td className="px-4 py-3 text-brand-navy">{valueLabel(d)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled.mutate(d)}
                      disabled={toggleEnabled.isPending}
                    >
                      <Badge
                        className={
                          d.enabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {d.enabled ? "Activo" : "Inactivo"}
                      </Badge>
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
              ))}
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

  const create = useMutation({
    mutationFn: () => apiFetch("/discount-codes", { method: "POST", body: { code, type, value } }),
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
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Código</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENIDA10"
              className="font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                <SelectItem value="fixed">Monto fijo (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Valor {type === "percentage" ? "(%)" : "(USD)"}
            </Label>
            <Input
              type="number"
              min={0}
              max={type === "percentage" ? 100 : undefined}
              step={type === "percentage" ? 1 : 0.01}
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!code.trim() || create.isPending}
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

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/discount-codes/${code.id}`, { method: "PATCH", body: { type, value, enabled } }),
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
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                <SelectItem value="fixed">Monto fijo (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Valor {type === "percentage" ? "(%)" : "(USD)"}
            </Label>
            <Input
              type="number"
              min={0}
              max={type === "percentage" ? 100 : undefined}
              step={type === "percentage" ? 1 : 0.01}
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Activo</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
