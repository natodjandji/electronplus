import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, CreditCard, Truck, ClipboardCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatMoney, useElectronStore } from "@/lib/electron-store";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout · Electron Plus" },
      { name: "description", content: "Completa tu compra en tres pasos: envío, pago y confirmación." },
      { property: "og:title", content: "Checkout · Electron Plus" },
      { property: "og:description", content: "Envío, pago y confirmación." },
    ],
  }),
  component: CheckoutPage,
});

const STEPS = [
  { id: 1, label: "Envío", icon: Truck },
  { id: 2, label: "Pago", icon: CreditCard },
  { id: 3, label: "Confirmación", icon: ClipboardCheck },
];

function CheckoutPage() {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState("transferencia");
  const { cart, cartTotal, clearCart } = useElectronStore();
  const navigate = useNavigate();

  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">Checkout</div>
        <h1 className="mt-1 text-3xl font-bold text-brand-navy">Finaliza tu compra</h1>

        {/* Stepper */}
        <div className="mt-8 flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex flex-1 items-center gap-3">
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition ${
                    done
                      ? "border-brand-blue bg-brand-blue text-white"
                      : active
                      ? "border-brand-blue text-brand-blue"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Paso {s.id}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      active || done ? "text-brand-navy" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-6">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">Información de envío</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre completo" placeholder="María Pérez" />
                  <Field label="Cédula / RIF" placeholder="V-00000000" />
                  <Field label="Teléfono" placeholder="+58 ..." />
                  <Field label="Correo" placeholder="tucorreo@dominio.com" />
                  <Field label="Ciudad" placeholder="Caracas" />
                  <Field label="Estado" placeholder="Miranda" />
                  <div className="sm:col-span-2">
                    <Field label="Dirección" placeholder="Av. Principal, edif..." />
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">Método de pago</h2>
                <RadioGroup value={method} onValueChange={setMethod} className="grid gap-3">
                  {[
                    { id: "transferencia", label: "Transferencia bancaria" },
                    { id: "pago-movil", label: "Pago móvil" },
                    { id: "efectivo", label: "Efectivo en tienda" },
                    { id: "credito", label: "Crédito B2B (mayoristas)" },
                  ].map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${
                        method === m.id ? "border-brand-blue bg-brand-blue/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value={m.id} />
                      <span className="font-medium text-brand-navy">{m.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">Confirma tu pedido</h2>
                <p className="text-sm text-muted-foreground">
                  Revisa que todo esté correcto antes de enviar. Recibirás una confirmación por correo.
                </p>
                <div className="rounded-md border border-border bg-brand-surface p-4 text-sm">
                  <div className="font-semibold text-brand-navy">Método: {method}</div>
                  <div className="text-muted-foreground">{cart.length} artículos · {formatMoney(cartTotal)}</div>
                </div>
              </div>
            )}

            <Separator className="my-6" />
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
                Atrás
              </Button>
              {step < 3 ? (
                <Button
                  className="bg-brand-blue text-white hover:bg-brand-blue/90"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Continuar
                </Button>
              ) : (
                <Button
                  className="bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90"
                  onClick={() => {
                    clearCart();
                    toast.success("¡Pedido confirmado! Te contactaremos pronto.");
                    navigate({ to: "/" });
                  }}
                >
                  Confirmar pedido
                </Button>
              )}
            </div>
          </Card>

          <Card className="h-fit p-6">
            <h3 className="text-sm font-semibold text-brand-navy">Resumen</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Artículos</span>
                <span>{cart.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-navy">Subtotal</span>
                <span className="text-brand-navy">{formatMoney(cartTotal)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold text-brand-navy">
                <span>Total</span>
                <span>{formatMoney(cartTotal)}</span>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </PublicShell>
  );
}

function Field({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-brand-navy">{label}</Label>
      <Input placeholder={placeholder} />
    </div>
  );
}
