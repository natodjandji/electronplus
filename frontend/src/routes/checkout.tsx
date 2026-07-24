import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  CreditCard,
  Truck,
  ClipboardCheck,
  Upload,
  Loader2,
  FileText,
  X,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { EASE_OUT_QUINT } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxIdField } from "@/components/tax-id-field";
import { PhoneField } from "@/components/phone-field";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatMoney, useElectronStore } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { compressImageToBase64 } from "@/lib/image-compress";
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
import { VENEZUELA_STATE_NAMES, citiesForState } from "@/lib/venezuela-locations";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>): { quoteId?: string } => ({
    quoteId: typeof search.quoteId === "string" ? search.quoteId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Checkout · Electron Plus" },
      {
        name: "description",
        content: "Completa tu compra en tres pasos: envío, pago y confirmación.",
      },
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

interface MyProfile {
  uid: string;
  email: string;
  displayName?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
}

interface PaymentMethodConfig {
  id: string;
  backendMethod: string;
  label: string;
  details: string[];
  needsReference: boolean;
  needsProof: boolean;
  enabled: boolean;
}

interface ShippingQuote {
  amount: number;
  matched: boolean;
}

interface QuoteItemForCheckout {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
}

interface QuoteForCheckout {
  id: string;
  status: "draft" | "sent" | "approved" | "rejected";
  globalDiscountPct: number;
  convertedOrderId?: string;
  items: QuoteItemForCheckout[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function CheckoutPage() {
  const { quoteId } = Route.useSearch();
  const isQuoteCheckout = Boolean(quoteId);
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const {
    cart,
    cartCount,
    cartTotal,
    clearCart,
    discount,
    clearDiscount,
    taxableBase,
    discountAmount,
    taxAmount,
  } = useElectronStore();
  const { data: bcv } = useBcvRate();
  const navigate = useNavigate();

  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ["quotes", quoteId],
    queryFn: () => apiFetch<QuoteForCheckout>(`/quotes/${quoteId}`),
    enabled: isQuoteCheckout,
  });

  const quoteItemsPriced = (quote?.items ?? []).map((item) => ({
    ...item,
    effectiveUnitPrice: round2(
      item.unitPrice * (1 - item.discountPct / 100) * (1 - (quote?.globalDiscountPct ?? 0) / 100),
    ),
  }));
  const quoteSubtotal = round2(
    quoteItemsPriced.reduce((s, i) => s + i.effectiveUnitPrice * i.qty, 0),
  );
  const effectiveTaxableBase = isQuoteCheckout ? quoteSubtotal : taxableBase;
  const effectiveTaxAmount = isQuoteCheckout ? round2(quoteSubtotal * 0.16) : taxAmount;
  const effectiveItemCount = isQuoteCheckout
    ? quoteItemsPriced.reduce((s, i) => s + i.qty, 0)
    : cartCount;

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const goToStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const reduceMotion = useReducedMotion();

  const [fullName, setFullName] = useState("");
  const [taxIdPrefix, setTaxIdPrefix] = useState<TaxIdPrefix>("V");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const [phonePrefix, setPhonePrefix] = useState<PhonePrefix>("0412");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const [method, setMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofBase64, setProofBase64] = useState<string | undefined>();
  const [proofFileName, setProofFileName] = useState<string | undefined>();
  const [proofBusy, setProofBusy] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const { data: myProfile } = useQuery({
    queryKey: ["users", "me", "checkout"],
    queryFn: () => apiFetch<MyProfile>("/users/me"),
    enabled: !!user,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => apiFetch<PaymentMethodConfig[]>("/payment-methods"),
    enabled: !!user,
  });
  const enabledMethods = paymentMethods?.filter((m) => m.enabled) ?? [];

  useEffect(() => {
    if (!method && paymentMethods) {
      const first = paymentMethods.find((m) => m.enabled);
      if (first) setMethod(first.id);
    }
  }, [method, paymentMethods]);

  const { data: shippingQuote } = useQuery({
    queryKey: ["shipping-rates", "quote", state, city],
    queryFn: () =>
      apiFetch<ShippingQuote>(
        `/shipping-rates/quote?state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`,
      ),
    enabled: !!state && !!city,
  });
  const shippingCost = state && city ? (shippingQuote?.amount ?? 0) : 0;
  const total = effectiveTaxableBase + effectiveTaxAmount + shippingCost;

  // First purchase: prefill just the name. Once an address has been saved
  // from a previous order, prefill everything from it (still all editable).
  useEffect(() => {
    if (!myProfile || prefilled) return;
    setFullName((prev) => prev || myProfile.displayName || "");
    if (myProfile.taxId) {
      const parsed = parseTaxId(myProfile.taxId);
      setTaxIdPrefix(parsed.prefix);
      setTaxIdNumber(parsed.number);
    }
    if (myProfile.phone) {
      const parsed = parsePhone(myProfile.phone);
      setPhonePrefix(parsed.prefix);
      setPhoneNumber(parsed.number);
    }
    if (myProfile.address) setAddress(myProfile.address);
    if (myProfile.state) setState(myProfile.state);
    if (myProfile.city) setCity(myProfile.city);
    setPrefilled(true);
  }, [myProfile, prefilled]);

  const email = user?.email ?? "";
  const taxIdValidation = validateTaxIdNumber(taxIdPrefix, taxIdNumber);
  const phoneValidation = validatePhoneNumber(phoneNumber);
  const info = enabledMethods.find((m) => m.id === method);

  const canContinueStep1 = Boolean(
    fullName.trim() &&
    taxIdNumber.trim() &&
    taxIdValidation.valid &&
    phoneNumber.trim() &&
    phoneValidation.valid &&
    address.trim() &&
    state &&
    city,
  );
  const canContinueStep2 =
    Boolean(info) && (!info!.needsReference || paymentReference.trim().length > 0);

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

  const handleSubmit = async () => {
    if (!info) return;
    setSubmitting(true);
    const shipping = {
      fullName: fullName.trim(),
      phone: formatPhone(phonePrefix, phoneNumber)!,
      taxId: formatTaxId(taxIdPrefix, taxIdNumber),
      address: address.trim(),
      city,
      state,
    };
    try {
      if (isQuoteCheckout && quoteId) {
        await apiFetch(`/orders/from-quote/${quoteId}`, {
          method: "POST",
          body: {
            paymentMethod: info.backendMethod,
            shipping,
            paymentReference: paymentReference.trim() || undefined,
            paymentProofBase64: proofBase64,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["quotes", quoteId] });
        queryClient.invalidateQueries({ queryKey: ["quotes", "mine"] });
      } else {
        await apiFetch("/orders", {
          method: "POST",
          body: {
            items: cart.map((i) => ({ productId: i.product.id, qty: i.qty })),
            paymentMethod: info.backendMethod,
            shipping,
            paymentReference: paymentReference.trim() || undefined,
            paymentProofBase64: proofBase64,
            discountCode: discount?.code,
          },
        });
        clearCart();
        clearDiscount();
      }

      // Best-effort — save this shipping info for next time. Doesn't block
      // order success if it fails.
      apiFetch("/users/me", {
        method: "PATCH",
        body: {
          displayName: shipping.fullName,
          phone: shipping.phone,
          taxId: shipping.taxId,
          address: shipping.address,
          city: shipping.city,
          state: shipping.state,
        },
      }).catch(() => {});

      toast.success("¡Pedido confirmado! Te contactaremos pronto.");
      navigate({ to: "/client/orders" });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo procesar tu pedido");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authLoading && !user) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
          <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-2xl font-bold text-brand-navy">Inicia sesión para pagar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Necesitas una cuenta para completar tu compra y dar seguimiento a tu pedido.
          </p>
          <Link to="/login" search={{ redirect: "/checkout" }}>
            <Button className="mt-6 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90">
              Iniciar sesión
            </Button>
          </Link>
        </section>
      </PublicShell>
    );
  }

  if (isQuoteCheckout) {
    if (quoteLoading) {
      return (
        <PublicShell>
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando cotización…
          </div>
        </PublicShell>
      );
    }
    if (
      !quote ||
      quote.status !== "approved" ||
      quote.convertedOrderId ||
      quote.items.length === 0
    ) {
      return (
        <PublicShell>
          <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
            <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="mt-3 text-2xl font-bold text-brand-navy">
              Esta cotización no está lista para pagar
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {quote?.convertedOrderId
                ? "Ya generaste un pedido a partir de esta cotización."
                : "Solo puedes continuar al pago con una cotización aprobada."}
            </p>
            <Link to="/quotes">
              <Button className="mt-6 bg-brand-blue text-white hover:bg-brand-blue/90">
                Ver mis cotizaciones
              </Button>
            </Link>
          </section>
        </PublicShell>
      );
    }
  } else if (cart.length === 0) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
          <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-2xl font-bold text-brand-navy">Tu carrito está vacío</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrega productos antes de continuar al checkout.
          </p>
          <Link to="/catalog">
            <Button className="mt-6 bg-brand-blue text-white hover:bg-brand-blue/90">
              Ir al catálogo
            </Button>
          </Link>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
          Checkout
        </div>
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
          <Card className="overflow-hidden p-6">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
                transition={{ duration: reduceMotion ? 0.15 : 0.25, ease: EASE_OUT_QUINT }}
              >
                {step === 1 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-brand-navy">Información de envío</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">
                          Nombre completo
                        </Label>
                        <Input
                          placeholder="María Pérez"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                      <TaxIdField
                        label="Cédula / RIF"
                        prefix={taxIdPrefix}
                        onPrefixChange={setTaxIdPrefix}
                        number={taxIdNumber}
                        onNumberChange={setTaxIdNumber}
                      />
                      <PhoneField
                        prefix={phonePrefix}
                        onPrefixChange={setPhonePrefix}
                        number={phoneNumber}
                        onNumberChange={setPhoneNumber}
                      />
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">Correo</Label>
                        <Input value={email} disabled className="bg-brand-surface" />
                      </div>
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
                        <Label className="text-xs font-medium text-brand-navy">Ciudad</Label>
                        <Select value={city} onValueChange={setCity} disabled={!state}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                state ? "Selecciona una ciudad" : "Elige un estado primero"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {citiesForState(state).map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-medium text-brand-navy">Dirección</Label>
                          <Input
                            placeholder="Av. Principal, edif..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    {state && city && (
                      <div className="rounded-md border border-border bg-brand-surface px-3 py-2 text-sm text-brand-navy">
                        Costo de envío a {city}, {state}:{" "}
                        <span className="font-semibold">
                          {shippingQuote ? formatMoney(shippingCost) : "calculando…"}
                        </span>
                        {shippingQuote && !shippingQuote.matched && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (sin tarifa configurada, te contactaremos para confirmarlo)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-brand-navy">Método de pago</h2>
                    {enabledMethods.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando métodos de pago…
                      </div>
                    ) : (
                      <RadioGroup value={method} onValueChange={setMethod} className="grid gap-3">
                        {enabledMethods.map((m) => (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${
                              method === m.id
                                ? "border-brand-blue bg-brand-blue/5"
                                : "border-border"
                            }`}
                          >
                            <RadioGroupItem value={m.id} />
                            <span className="font-medium text-brand-navy">{m.label}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    )}

                    {info && (
                      <div className="rounded-md border border-border bg-brand-surface p-4 text-sm">
                        <div className="font-semibold text-brand-navy">{info.label}</div>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {info.details.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        {(info.needsReference || info.needsProof) && (
                          <div className="mt-3 flex items-baseline gap-2 border-t border-border pt-3">
                            <span className="text-xs text-muted-foreground">Monto a pagar:</span>
                            <span className="font-bold text-brand-navy">{formatMoney(total)}</span>
                            {bcv && (
                              <span className="text-xs font-semibold text-brand-blue">
                                ≈ {formatBs(total, bcv.rate)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {info?.needsReference && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">
                          Número de referencia / confirmación
                        </Label>
                        <Input
                          placeholder="0000000000"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                        />
                      </div>
                    )}

                    {info?.needsProof && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">
                          Comprobante de pago (opcional)
                        </Label>
                        {proofFileName ? (
                          <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
                            <span className="flex items-center gap-2 truncate text-brand-navy">
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
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground transition hover:border-brand-blue/40 hover:text-brand-blue">
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
                      </div>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-brand-navy">Confirma tu pedido</h2>
                    <p className="text-sm text-muted-foreground">
                      Revisa que todo esté correcto antes de enviar. Recibirás una confirmación por
                      correo.
                    </p>

                    <div className="rounded-md border border-border p-4 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Envío
                      </div>
                      <div className="mt-1.5 grid gap-1 text-brand-navy sm:grid-cols-2">
                        <div>{fullName}</div>
                        <div>{formatTaxId(taxIdPrefix, taxIdNumber) ?? "—"}</div>
                        <div>{formatPhone(phonePrefix, phoneNumber)}</div>
                        <div>{email}</div>
                        <div>
                          {city}, {state}
                        </div>
                        <div className="sm:col-span-2">{address}</div>
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-4 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Pago
                      </div>
                      <div className="mt-1.5 text-brand-navy">{info?.label}</div>
                      {paymentReference && (
                        <div className="text-muted-foreground">Referencia: {paymentReference}</div>
                      )}
                      {proofFileName && (
                        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" /> Comprobante adjunto: {proofFileName}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border border-border p-4 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Productos
                      </div>
                      <div className="mt-2 space-y-2">
                        {isQuoteCheckout
                          ? quoteItemsPriced.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-brand-navy">
                                    {item.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.sku} · {formatMoney(item.effectiveUnitPrice)} × {item.qty}
                                  </div>
                                </div>
                                <div className="shrink-0 font-semibold text-brand-navy">
                                  {formatMoney(item.effectiveUnitPrice * item.qty)}
                                </div>
                              </div>
                            ))
                          : cart.map(({ product, qty }) => (
                              <div
                                key={product.id}
                                className="flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-brand-navy">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {product.sku} · {formatMoney(product.retailPrice)} × {qty}
                                  </div>
                                </div>
                                <div className="shrink-0 font-semibold text-brand-navy">
                                  {formatMoney(product.retailPrice * qty)}
                                </div>
                              </div>
                            ))}
                      </div>
                      <Separator className="my-3" />
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>
                            {formatMoney(isQuoteCheckout ? effectiveTaxableBase : cartTotal)}
                          </span>
                        </div>
                        {!isQuoteCheckout && discount && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Descuento ({discount.code})</span>
                            <span>-{formatMoney(discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>IVA (16%)</span>
                          <span>{formatMoney(effectiveTaxAmount)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Envío</span>
                          <span>{formatMoney(shippingCost)}</span>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div className="flex items-baseline justify-between">
                        <span className="font-bold text-brand-navy">Total</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-bold text-brand-navy">{formatMoney(total)}</span>
                          {bcv && (
                            <span className="text-xs font-semibold text-brand-blue">
                              ≈ {formatBs(total, bcv.rate)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <Separator className="my-6" />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => goToStep(Math.max(1, step - 1))}
                disabled={step === 1}
              >
                Atrás
              </Button>
              {step < 3 ? (
                <Button
                  className="bg-brand-blue text-white hover:bg-brand-blue/90"
                  disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2)}
                  onClick={() => goToStep(step + 1)}
                >
                  Continuar
                </Button>
              ) : (
                <Button
                  className="gap-2 bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
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
                <span>{effectiveItemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-navy">Subtotal</span>
                <span className="text-brand-navy">
                  {formatMoney(isQuoteCheckout ? effectiveTaxableBase : cartTotal)}
                </span>
              </div>
              {!isQuoteCheckout && discount && (
                <div className="flex justify-between">
                  <span className="text-brand-navy">Descuento ({discount.code})</span>
                  <span className="text-brand-navy">-{formatMoney(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-brand-navy">IVA (16%)</span>
                <span className="text-brand-navy">{formatMoney(effectiveTaxAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-navy">Envío</span>
                <span className="text-brand-navy">
                  {state && city ? formatMoney(shippingCost) : "A calcular"}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold text-brand-navy">Total</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-brand-navy">{formatMoney(total)}</span>
                  {bcv && (
                    <span className="text-xs font-semibold text-brand-blue">
                      ≈ {formatBs(total, bcv.rate)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </PublicShell>
  );
}
