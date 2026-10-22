import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, MapPin, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PublicShell } from "@/components/public-shell";
import { PhoneField } from "@/components/phone-field";
import { TaxIdField } from "@/components/tax-id-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, reportError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  addressState,
  toDraft,
  toProfileUpdate,
  type Account,
  type Draft,
} from "@/lib/profile-form";
import { VENEZUELA_STATE_NAMES, citiesForState } from "@/lib/venezuela-locations";
import { validatePhoneNumber } from "@/lib/venezuelan-phone";
import { validateTaxIdNumber } from "@/lib/venezuelan-tax-id";

export const Route = createFileRoute("/client/profile")({
  head: () => ({
    meta: [
      { title: "Mi perfil · Electron Plus" },
      { name: "description", content: "Tus datos y tu dirección de envío en Electron Plus." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

const ACCOUNT_KEY = ["users", "me"] as const;

function ProfilePage() {
  const queryClient = useQueryClient();
  const { applySavedProfile } = useAuth();
  const { data: account, isLoading } = useQuery({
    queryKey: [...ACCOUNT_KEY, "profile"],
    queryFn: () => apiFetch<Account>("/users/me"),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  // The address fields stay folded away until there is an address or the
  // customer asks to add one.
  const [addingAddress, setAddingAddress] = useState(false);
  useEffect(() => {
    if (account) setDraft(toDraft(account));
  }, [account]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const saved = useMemo(() => (account ? toDraft(account) : null), [account]);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      apiFetch<Account>("/users/me", {
        method: "PATCH",
        body: toProfileUpdate(d),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData([...ACCOUNT_KEY, "profile"], updated);
      // The checkout prefills from the same profile; this page already has
      // the saved one, so nothing refetches under the customer's typing.
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY, refetchType: "none" });
      applySavedProfile(updated);
      setAddingAddress(false);
      toast.success("Perfil actualizado");
    },
    onError: (error) => reportError(error),
  });

  if (isLoading || !draft || !account) {
    return (
      <ProfileShell>
        <div className="mt-8 grid gap-6">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-4 p-6">
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-10" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </ProfileShell>
    );
  }

  const nameValid = draft.displayName.trim().length > 0;
  const taxIdValid = validateTaxIdNumber(draft.taxIdPrefix, draft.taxIdNumber).valid;
  const phoneValid = validatePhoneNumber(draft.phoneNumber).valid;
  const address = addressState(draft);
  const canSave = changed && nameValid && taxIdValid && phoneValid && address !== "partial";
  const hasSavedAddress = Boolean(account.address || account.city || account.state);
  const showAddress = hasSavedAddress || addingAddress || address !== "empty";

  return (
    <ProfileShell>
      <form
        className="mt-8 grid gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate(draft);
        }}
      >
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-brand-navy">
            <UserRound className="h-4 w-4 text-brand-blue" /> Datos personales
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Nombre completo</Label>
              <Input
                placeholder="María Pérez"
                value={draft.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                aria-invalid={!nameValid}
              />
              {!nameValid && <p className="text-xs text-destructive">Escribe tu nombre.</p>}
            </Field>
            <TaxIdField
              label="Cédula / RIF (opcional)"
              prefix={draft.taxIdPrefix}
              onPrefixChange={(v) => set("taxIdPrefix", v)}
              number={draft.taxIdNumber}
              onNumberChange={(v) => set("taxIdNumber", v)}
            />
            <div className="grid gap-2">
              <PhoneField
                prefix={draft.phonePrefix}
                onPrefixChange={(v) => set("phonePrefix", v)}
                number={draft.phoneNumber}
                onNumberChange={(v) => set("phoneNumber", v)}
              />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={draft.whatsappUpdates}
                  onCheckedChange={(v) => set("whatsappUpdates", v === true)}
                  className="mt-px"
                />
                Recibir las actualizaciones de mis pedidos y cotizaciones por WhatsApp
              </label>
            </div>
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Correo</Label>
              <Input value={account.email} disabled className="bg-brand-surface" />
              <p className="text-xs text-muted-foreground">
                Es el correo con el que inicias sesión; no se puede cambiar.
              </p>
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-brand-navy">
              <MapPin className="h-4 w-4 text-brand-blue" /> Dirección de envío
            </h2>
            {address !== "empty" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  setDraft((d) => (d ? { ...d, state: "", city: "", address: "" } : d));
                  setAddingAddress(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Quitar dirección
              </Button>
            )}
          </div>

          {showAddress ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Estado</Label>
                <Select
                  value={draft.state}
                  onValueChange={(v) => setDraft((d) => (d ? { ...d, state: v, city: "" } : d))}
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
              </Field>
              <Field className="grid gap-1.5">
                <Label className="text-xs font-medium text-brand-navy">Ciudad</Label>
                <Select
                  value={draft.city}
                  onValueChange={(v) => set("city", v)}
                  disabled={!draft.state}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        draft.state ? "Selecciona una ciudad" : "Elige un estado primero"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {citiesForState(draft.state).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-brand-navy">Dirección</Label>
                <Input
                  placeholder="Av. Principal, edif..."
                  value={draft.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
              {address === "partial" && (
                <p className="text-xs text-destructive sm:col-span-2">
                  Completa el estado, la ciudad y la dirección, o quita la dirección.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border bg-brand-surface px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Aún no tienes una dirección de envío registrada.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAddingAddress(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar dirección
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            La usamos para llenar tus datos de envío al pagar; ahí también puedes cambiarla.
          </p>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!changed || save.isPending}
            onClick={() => {
              setDraft(toDraft(account));
              setAddingAddress(false);
            }}
          >
            Descartar cambios
          </Button>
          <Button
            type="submit"
            className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      </form>
    </ProfileShell>
  );
}

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
          Mi cuenta
        </div>
        <h1 className="mt-1 text-3xl font-bold text-brand-navy">Mi perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus datos y tu dirección de envío. Con ellos llenamos el pago por ti.
        </p>
        {children}
      </section>
    </PublicShell>
  );
}
