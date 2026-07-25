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
import { TaxIdField } from "@/components/tax-id-field";
import { PhoneField } from "@/components/phone-field";
import { apiFetch, ApiError, reportError } from "@/lib/api-client";
import { formatTaxId, validateTaxIdNumber, type TaxIdPrefix } from "@/lib/venezuelan-tax-id";
import { formatPhone, validatePhoneNumber, type PhonePrefix } from "@/lib/venezuelan-phone";
import { toast } from "sonner";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
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
    <div className="flex min-w-0 gap-2">
      <Select
        value={value ?? ""}
        onValueChange={(id) => {
          const supplier = suppliers?.find((s) => s.id === id);
          if (supplier) onChange(supplier.id, supplier.name);
        }}
      >
        <SelectTrigger className="min-w-0 flex-1">
          <SelectValue className="truncate" placeholder={isLoading ? "Cargando…" : placeholder} />
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
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={() => setCreating(true)}
      >
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
  const [taxIdPrefix, setTaxIdPrefix] = useState<TaxIdPrefix>("J");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phonePrefix, setPhonePrefix] = useState<PhonePrefix>("0212");
  const [phoneNumber, setPhoneNumber] = useState("");

  const taxIdValid = validateTaxIdNumber(taxIdPrefix, taxIdNumber).valid;
  const phoneValid = validatePhoneNumber(phoneNumber).valid;
  const emailValid = !contactEmail || EMAIL_PATTERN.test(contactEmail);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Supplier>("/finance/suppliers", {
        method: "POST",
        body: {
          name,
          taxId: formatTaxId(taxIdPrefix, taxIdNumber),
          contactEmail: contactEmail || undefined,
          contactPhone: formatPhone(phonePrefix, phoneNumber),
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
          <TaxIdField
            label="RIF (opcional)"
            prefix={taxIdPrefix}
            onPrefixChange={setTaxIdPrefix}
            number={taxIdNumber}
            onNumberChange={setTaxIdNumber}
          />
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Correo de contacto (opcional)
            </Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contacto@proveedor.com"
              aria-invalid={!emailValid}
            />
            {!emailValid && <p className="text-xs text-destructive">Correo inválido.</p>}
          </div>
          <PhoneField
            label="Teléfono de contacto (opcional)"
            prefix={phonePrefix}
            onPrefixChange={setPhonePrefix}
            number={phoneNumber}
            onNumberChange={setPhoneNumber}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!name || !taxIdValid || !phoneValid || !emailValid || create.isPending}
            onClick={() => create.mutate()}
          >
            Crear proveedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
