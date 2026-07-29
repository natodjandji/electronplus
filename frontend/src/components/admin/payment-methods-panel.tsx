import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { toast } from "sonner";
import { usePaymentMethods, type PaymentMethodConfig } from "@/lib/payment-methods";

export function PaymentMethodsPanel() {
  const { data: methods, isLoading } = usePaymentMethods();
  const [editing, setEditing] = useState<PaymentMethodConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PaymentMethodConfig | null>(null);
  const queryClient = useQueryClient();

  const toggleEnabled = useMutation({
    mutationFn: (m: PaymentMethodConfig) =>
      apiFetch(`/payment-methods/${m.id}`, { method: "PATCH", body: { enabled: !m.enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-methods"] }),
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/payment-methods/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("Método de pago eliminado");
      setDeleting(null);
    },
    onError: reportError,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Personaliza la información que ven tus clientes al pagar: datos bancarios, referencias
          requeridas y si piden comprobante. Actívalos, desactívalos, o crea nuevos canales de pago.
        </p>
        <Button
          className="shrink-0 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo método
        </Button>
      </div>

      {isLoading && (
        <div className="mt-6 flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando métodos de pago…
        </div>
      )}

      {methods && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {methods.map((m) => (
            <Card key={m.id} className={`p-5 ${!m.enabled ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div className="font-semibold text-brand-navy">{m.label}</div>
                </div>
                <Switch
                  checked={m.enabled}
                  disabled={toggleEnabled.isPending}
                  onCheckedChange={() => toggleEnabled.mutate(m)}
                />
              </div>

              <ul className="mt-3 space-y-0.5 text-sm text-muted-foreground">
                {m.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {m.needsReference && (
                  <Badge className="bg-brand-surface text-brand-navy">Pide referencia</Badge>
                )}
                {m.needsProof && (
                  <Badge className="bg-brand-surface text-brand-navy">Pide comprobante</Badge>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(m)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive"
                  onClick={() => setDeleting(m)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <EditMethodDialog method={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateMethodDialog onClose={() => setCreating(false)} />}

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar {deleting?.label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Los clientes ya no podrán elegir este método en el checkout. Esta acción no se puede
            deshacer.
          </p>
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

function EditMethodDialog({
  method,
  onClose,
}: {
  method: PaymentMethodConfig;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(method.label);
  const [detailsText, setDetailsText] = useState(method.details.join("\n"));
  const [needsReference, setNeedsReference] = useState(method.needsReference);
  const [needsProof, setNeedsProof] = useState(method.needsProof);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/payment-methods/${method.id}`, {
        method: "PATCH",
        body: {
          label,
          details: detailsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          needsReference,
          needsProof,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("Método de pago actualizado");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {method.label}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Nombre visible</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Datos mostrados al cliente (una línea por dato)
            </Label>
            <Textarea
              rows={5}
              value={detailsText}
              onChange={(e) => setDetailsText(e.target.value)}
              placeholder={"Banco: Banesco\nCuenta: 0134-...\nRIF: J-000000000"}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Pide número de referencia</Label>
            <Switch checked={needsReference} onCheckedChange={setNeedsReference} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Pide comprobante de pago</Label>
            <Switch checked={needsProof} onCheckedChange={setNeedsProof} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!label.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateMethodDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [detailsText, setDetailsText] = useState("");
  const [needsReference, setNeedsReference] = useState(true);
  const [needsProof, setNeedsProof] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/payment-methods", {
        method: "POST",
        body: {
          label,
          details: detailsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          needsReference,
          needsProof,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success("Método de pago creado");
      onClose();
    },
    onError: reportError,
  });

  const canSave = label.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo método de pago</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Nombre visible</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Zelle empresarial"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Datos mostrados al cliente (una línea por dato)
            </Label>
            <Textarea
              rows={4}
              value={detailsText}
              onChange={(e) => setDetailsText(e.target.value)}
              placeholder={"Banco: Banesco\nCuenta: 0134-...\nRIF: J-000000000"}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Pide número de referencia</Label>
            <Switch checked={needsReference} onCheckedChange={setNeedsReference} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm text-brand-navy">Pide comprobante de pago</Label>
            <Switch checked={needsProof} onCheckedChange={setNeedsProof} />
          </div>
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
            Crear método
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
