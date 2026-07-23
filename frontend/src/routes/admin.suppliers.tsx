import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Loader2, Mail, Pencil, Phone, Plus } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaxIdField } from "@/components/tax-id-field";
import { PhoneField } from "@/components/phone-field";
import { CreateSupplierDialog, useSuppliers } from "@/components/supplier-picker";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  formatTaxId,
  parseTaxId,
  validateTaxIdNumber,
  type TaxIdPrefix,
} from "@/lib/venezuelan-tax-id";
import {
  formatPhone,
  parsePhone,
  validatePhoneNumber,
  type PhonePrefix,
} from "@/lib/venezuelan-phone";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/suppliers")({
  head: () => ({
    meta: [
      { title: "Proveedores · Admin Electron Plus" },
      {
        name: "description",
        content: "Directorio de proveedores y los productos que les compras.",
      },
    ],
  }),
  component: SuppliersPage,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  stock: number;
  supplierId?: string;
}

function reportError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Ocurrió un error inesperado");
}

function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => apiFetch<AdminProduct[]>("/products/admin"),
  });
}

function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: products } = useAdminProducts();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const productsFor = (supplierId: string) =>
    (products ?? []).filter((p) => p.supplierId === supplierId);

  return (
    <AdminShell title="Proveedores">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Asocia cada producto a un proveedor desde Inventario para poder filtrarlos aquí.
        </p>
        <Button
          className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proveedores…
        </div>
      )}

      {!isLoading && (suppliers?.length ?? 0) === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No hay proveedores registrados todavía.
        </Card>
      )}

      {suppliers && suppliers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Card
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="cursor-pointer p-4 transition-colors hover:border-brand-blue/40"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-brand-navy">{s.name}</div>
                  {s.taxId && <div className="text-xs text-muted-foreground">{s.taxId}</div>}
                  <div className="mt-1 text-xs font-medium text-brand-blue">
                    {productsFor(s.id).length} producto(s) asociado(s)
                  </div>
                  {s.contactEmail && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> {s.contactEmail}
                    </div>
                  )}
                  {s.contactPhone && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {s.contactPhone}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateSupplierDialog onClose={() => setCreating(false)} />}

      {selectedId && (
        <SupplierDetailDialog
          supplierId={selectedId}
          products={productsFor(selectedId)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </AdminShell>
  );
}

function SupplierDetailDialog({
  supplierId,
  products,
  onClose,
}: {
  supplierId: string;
  products: AdminProduct[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: suppliers } = useSuppliers();
  const supplier = suppliers?.find((s) => s.id === supplierId);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [taxIdPrefix, setTaxIdPrefix] = useState<TaxIdPrefix>("J");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phonePrefix, setPhonePrefix] = useState<PhonePrefix>("0212");
  const [phoneNumber, setPhoneNumber] = useState("");

  const taxIdValid = validateTaxIdNumber(taxIdPrefix, taxIdNumber).valid;
  const phoneValid = validatePhoneNumber(phoneNumber).valid;
  const emailValid = !contactEmail || EMAIL_PATTERN.test(contactEmail);

  const startEditing = () => {
    if (!supplier) return;
    setName(supplier.name);
    const parsedTaxId = parseTaxId(supplier.taxId);
    setTaxIdPrefix(parsedTaxId.prefix);
    setTaxIdNumber(parsedTaxId.number);
    setContactEmail(supplier.contactEmail ?? "");
    const parsedPhone = parsePhone(supplier.contactPhone);
    setPhonePrefix(parsedPhone.prefix);
    setPhoneNumber(parsedPhone.number);
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/finance/suppliers/${supplierId}`, {
        method: "PATCH",
        body: {
          name,
          taxId: formatTaxId(taxIdPrefix, taxIdNumber),
          contactEmail: contactEmail || undefined,
          contactPhone: formatPhone(phonePrefix, phoneNumber),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success("Proveedor actualizado");
      setEditing(false);
    },
    onError: reportError,
  });

  if (!supplier) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-blue/10 text-brand-blue">
                <Building2 className="h-5 w-5" />
              </div>
              <DialogTitle className="truncate">{supplier.name}</DialogTitle>
            </div>
            {!editing && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={startEditing}
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        {!editing && (
          <div className="grid gap-1.5 text-sm">
            {supplier.taxId && <div className="text-muted-foreground">RIF: {supplier.taxId}</div>}
            {supplier.contactEmail && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {supplier.contactEmail}
              </div>
            )}
            {supplier.contactPhone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {supplier.contactPhone}
              </div>
            )}
          </div>
        )}

        {editing && (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-brand-blue text-white hover:bg-brand-blue/90"
                disabled={!name || !taxIdValid || !phoneValid || !emailValid || save.isPending}
                onClick={() => save.mutate()}
              >
                Guardar cambios
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Productos asociados ({products.length})
          </div>
          {products.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Sin productos asociados. Asígnalos desde Inventario.
            </div>
          ) : (
            <div className="space-y-1.5">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-brand-navy">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </div>
                  <Badge className="bg-brand-blue/10 text-brand-blue">{p.stock} uds</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
