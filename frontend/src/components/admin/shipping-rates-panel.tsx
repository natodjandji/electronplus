import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
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
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { VENEZUELA_STATE_NAMES, citiesForState } from "@/lib/venezuela-locations";
import { toast } from "sonner";

const STATE_WIDE_CITY = "*";

interface ShippingRate {
  id: string;
  state: string;
  city: string;
  amount: number;
}

function useShippingRates() {
  return useQuery({
    queryKey: ["admin", "shipping-rates"],
    queryFn: () => apiFetch<ShippingRate[]>("/shipping-rates"),
  });
}

function cityLabel(city: string): string {
  return city === STATE_WIDE_CITY ? "Todos los municipios (tarifa por defecto)" : city;
}

export function ShippingRatesPanel() {
  const { data: rates, isLoading } = useShippingRates();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ShippingRate | null>(null);
  const [deleting, setDeleting] = useState<ShippingRate | null>(null);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/shipping-rates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "shipping-rates"] });
      toast.success("Tarifa eliminada");
      setDeleting(null);
    },
    onError: reportError,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Define el costo de envío según el estado y municipio del cliente — se calcula
          automáticamente en el checkout. Usa "Todos los municipios" para fijar una tarifa por
          defecto en un estado.
        </p>
        <Button
          className="shrink-0 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nueva tarifa
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-brand-surface">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Municipio</th>
                <th className="px-4 py-2 text-right">Monto</th>
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
              {!isLoading && (rates?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No hay tarifas configuradas — el envío se mostrará como "no configurado".
                  </td>
                </tr>
              )}
              {rates?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-brand-navy">{r.state}</td>
                  <td className="px-4 py-3">
                    {r.city === STATE_WIDE_CITY ? (
                      <Badge className="gap-1 bg-brand-yellow text-brand-navy">
                        <MapPin className="h-3 w-3" /> Tarifa por defecto
                      </Badge>
                    ) : (
                      r.city
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-navy">
                    {formatMoney(r.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleting(r)}
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

      {creating && <CreateRateDialog onClose={() => setCreating(false)} />}
      {editing && <EditRateDialog rate={editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              ¿Eliminar tarifa de {deleting?.state} · {deleting && cityLabel(deleting.city)}?
            </DialogTitle>
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

function CreateRateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [amount, setAmount] = useState(0);
  const cities = state ? citiesForState(state) : [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/shipping-rates", { method: "POST", body: { state, city, amount } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "shipping-rates"] });
      toast.success("Tarifa creada");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva tarifa de envío</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Estado</Label>
            <Select
              value={state}
              onValueChange={(v) => {
                setState(v);
                setCity("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                {VENEZUELA_STATE_NAMES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Municipio</Label>
            <Select value={city} onValueChange={setCity} disabled={!state}>
              <SelectTrigger>
                <SelectValue placeholder={state ? "Selecciona…" : "Elige un estado primero"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STATE_WIDE_CITY}>
                  Todos los municipios (tarifa por defecto)
                </SelectItem>
                {cities.map((c) => (
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
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!state || !city || create.isPending}
            onClick={() => create.mutate()}
          >
            Crear tarifa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRateDialog({ rate, onClose }: { rate: ShippingRate; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(rate.amount);

  const save = useMutation({
    mutationFn: () => apiFetch(`/shipping-rates/${rate.id}`, { method: "PATCH", body: { amount } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "shipping-rates"] });
      toast.success("Tarifa actualizada");
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {rate.state} · {cityLabel(rate.city)}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-brand-navy">Monto (USD)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          />
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
