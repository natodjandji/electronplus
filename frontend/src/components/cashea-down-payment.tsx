import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { FileText, Loader2, Store, Upload, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiFetch, reportError } from "@/lib/api-client";
import { ONLINE_DOWN_PAYMENT_METHODS, type CasheaPaymentRecord } from "@/lib/cashea";
import { formatMoney } from "@/lib/electron-store";
import { compressImageToBase64 } from "@/lib/image-compress";
import { usePaymentMethods } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

/**
 * The buyer tells the store how they pay Cashea's down payment ("inicial"):
 * online through one of the store's payment methods (with its reference),
 * or at the store when picking the order up. Cashea shows the amount in the
 * plan the buyer just accepted. Can be sent again until the store confirms.
 */
export function CasheaDownPaymentForm({
  payment,
  pickup,
  onSent,
}: {
  payment: CasheaPaymentRecord;
  pickup: boolean;
  onSent?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: paymentMethods } = usePaymentMethods();
  const onlineMethods = (paymentMethods ?? []).filter(
    (m) => m.enabled && ONLINE_DOWN_PAYMENT_METHODS.includes(m.backendMethod),
  );
  const previous = payment.cashea?.downPayment;

  const [where, setWhere] = useState<"online" | "store">(
    previous?.atStore && pickup ? "store" : "online",
  );
  const [methodId, setMethodId] = useState<string | undefined>(
    previous && !previous.atStore ? previous.methodId : undefined,
  );
  const [amount, setAmount] = useState(
    previous && !previous.atStore ? String(previous.amount) : "",
  );
  const [reference, setReference] = useState(
    previous && !previous.atStore ? (previous.reference ?? "") : "",
  );
  const [proofBase64, setProofBase64] = useState<string>();
  const [proofFileName, setProofFileName] = useState<string>();
  const [proofBusy, setProofBusy] = useState(false);

  const method = onlineMethods.find((m) => m.id === methodId) ?? onlineMethods[0];
  const parsedAmount = Number(amount.replace(",", "."));
  const amountValid = parsedAmount > 0 && parsedAmount < payment.amount;
  const canSend =
    where === "store" ||
    (Boolean(method) && amountValid && (!method?.needsReference || reference.trim().length > 0));

  const handleProofFile = async (file: File) => {
    setProofBusy(true);
    try {
      const base64 = await compressImageToBase64(file);
      if (base64.length > 900_000) {
        toast.error("La imagen sigue siendo muy pesada — intenta con otra captura.");
        return;
      }
      setProofBase64(base64);
      setProofFileName(file.name);
    } catch {
      toast.error("No se pudo procesar la imagen del comprobante.");
    } finally {
      setProofBusy(false);
    }
  };

  const send = useMutation({
    mutationFn: () =>
      apiFetch(`/payments/${payment.id}/cashea/down-payment`, {
        method: "POST",
        body:
          where === "store"
            ? { atStore: true }
            : {
                atStore: false,
                methodId: method!.id,
                amount: Math.round(parsedAmount * 100) / 100,
                reference: reference.trim() || undefined,
                proofBase64,
              },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["cashea", "return", payment.orderId] });
      toast.success(
        where === "store"
          ? "Listo: pagarás la inicial al retirar tu pedido."
          : "Recibimos tu pago de la inicial; lo verificaremos pronto.",
      );
      onSent?.();
    },
    onError: reportError,
  });

  return (
    <div className="space-y-4">
      {pickup && (
        <RadioGroup
          value={where}
          onValueChange={(v) => setWhere(v as "online" | "store")}
          className="grid gap-2 sm:grid-cols-2"
        >
          <Choice value="online" current={where} icon={Wallet} title="Pagar ahora en línea">
            Pago móvil, transferencia u otro método de la tienda.
          </Choice>
          <Choice value="store" current={where} icon={Store} title="Pagar en la tienda">
            La pagas al retirar tu pedido.
          </Choice>
        </RadioGroup>
      )}

      {where === "store" ? (
        <p className="rounded-md border border-border bg-brand-surface p-3 text-sm text-muted-foreground">
          Al retirar tu pedido pagas la inicial que te indicó Cashea, y te lo entregamos en ese
          momento.
        </p>
      ) : onlineMethods.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando métodos de pago…
        </div>
      ) : (
        <>
          <RadioGroup
            value={method?.id}
            onValueChange={setMethodId}
            className="grid gap-2 sm:grid-cols-2"
            aria-label="Método con el que pagaste la inicial"
          >
            {onlineMethods.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm transition-colors",
                  method?.id === m.id ? "border-brand-blue bg-brand-blue/5" : "border-border",
                )}
              >
                <RadioGroupItem value={m.id} />
                <span className="font-medium text-brand-navy">{m.label}</span>
              </label>
            ))}
          </RadioGroup>

          {method && (
            <div className="rounded-md border border-border bg-brand-surface p-3 text-sm">
              <div className="font-semibold text-brand-navy">{method.label}</div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {method.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field className="grid gap-1.5">
              <Label htmlFor="cashea-down-amount" className="text-xs font-medium text-brand-navy">
                Monto de la inicial (REF)
              </Label>
              <Input
                id="cashea-down-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amount !== "" && !amountValid}
              />
              <span className="text-xs text-muted-foreground">
                El que te mostró Cashea en tu plan de pagos.
              </span>
            </Field>
            {method?.needsReference && (
              <Field className="grid gap-1.5">
                <Label htmlFor="cashea-down-ref" className="text-xs font-medium text-brand-navy">
                  Número de referencia
                </Label>
                <Input
                  id="cashea-down-ref"
                  placeholder="0000000000"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            )}
          </div>

          {method?.needsProof && (
            <Field className="grid gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Comprobante (opcional)</Label>
              {proofFileName ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-brand-navy">
                    <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                    <span className="truncate">{proofFileName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setProofBase64(undefined);
                      setProofFileName(undefined);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar comprobante"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground transition-colors hover:border-brand-blue/40 hover:text-brand-blue">
                  {proofBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Subir captura del pago
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleProofFile(file);
                    }}
                  />
                </label>
              )}
            </Field>
          )}
          {amount !== "" && !amountValid && (
            <p className="text-xs text-destructive">
              La inicial debe ser mayor que cero y menor que el total ({formatMoney(payment.amount)}
              ).
            </p>
          )}
        </>
      )}

      <Button
        className="w-full gap-2 bg-brand-blue text-white hover:bg-brand-blue/90 sm:w-auto"
        disabled={!canSend || send.isPending || proofBusy}
        onClick={() => send.mutate()}
      >
        {send.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {where === "store" ? "Pagaré la inicial en la tienda" : "Enviar pago de la inicial"}
      </Button>
    </div>
  );
}

function Choice({
  value,
  current,
  icon: Icon,
  title,
  children,
}: {
  value: string;
  current: string;
  icon: typeof Store;
  title: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
        current === value ? "border-brand-blue bg-brand-blue/5" : "border-border",
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="flex items-center gap-1.5 font-semibold text-brand-navy">
          <Icon className="h-4 w-4 text-brand-blue" /> {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}
