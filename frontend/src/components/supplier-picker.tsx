import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
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
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["admin", "suppliers"],
    queryFn: () => apiFetch<Supplier[]>("/finance/suppliers"),
  });
}

export function SupplierPicker({
  value,
  onChange,
  placeholder = "Seleccionar proveedor…",
}: {
  value?: string;
  onChange: (supplierId: string, supplierName: string) => void;
  placeholder?: string;
}) {
  const { data: suppliers, isLoading } = useSuppliers();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex gap-2">
      <Select
        value={value ?? ""}
        onValueChange={(id) => {
          const supplier = suppliers?.find((s) => s.id === id);
          if (supplier) onChange(supplier.id, supplier.name);
        }}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={isLoading ? "Cargando…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {suppliers?.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No hay proveedores todavía
            </div>
          )}
          {suppliers?.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="icon" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
      </Button>
      {creating && (
        <CreateSupplierDialog
          onClose={() => setCreating(false)}
          onCreated={(supplier) => {
            onChange(supplier.id, supplier.name);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

export function CreateSupplierDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (supplier: Supplier) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Supplier>("/finance/suppliers", {
        method: "POST",
        body: {
          name,
          taxId: taxId || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
        },
      }),
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success("Proveedor creado");
      onCreated?.(supplier);
      onClose();
    },
    onError: reportError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del proveedor"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">RIF (opcional)</Label>
            <Input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="J-12345678-9"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Correo de contacto (opcional)
            </Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contacto@proveedor.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Teléfono de contacto (opcional)
            </Label>
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="0212-1234567"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!name || create.isPending}
            onClick={() => create.mutate()}
          >
            Crear proveedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
