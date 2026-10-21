import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

/** The backend's PaymentMethod enum (payments/entities/payment.entity.ts),
 * mirrored here since there's no shared package between backend and
 * frontend in this repo. */
export type PaymentMethod =
  "bank_transfer" | "pago_movil" | "cash" | "zelle" | "paypal" | "cashea" | "other";

/** Generic fallback covers every payment channel an admin adds through the
 * payment-methods panel (all tagged "other" server-side) — the panel's own
 * PaymentMethodConfig.label is the actually-correct display name for those;
 * this is only the last-resort fallback when no config is available. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Transferencia bancaria",
  pago_movil: "Pago móvil",
  cash: "Efectivo",
  zelle: "Zelle",
  paypal: "PayPal",
  cashea: "Cashea",
  other: "Otro",
};

export interface PaymentMethodConfig {
  id: string;
  backendMethod: string;
  label: string;
  details: string[];
  needsReference: boolean;
  needsProof: boolean;
  enabled: boolean;
}

export function usePaymentMethods(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => apiFetch<PaymentMethodConfig[]>("/payment-methods"),
    enabled: options?.enabled,
  });
}

export function paymentMethodLabel(
  methods: PaymentMethodConfig[] | undefined,
  backendMethod?: string,
) {
  if (!backendMethod) return undefined;
  // Several methods can share a type (an admin's are all "other"): then
  // the type can't say which one, so it's named generically.
  const matches = methods?.filter((m) => m.backendMethod === backendMethod) ?? [];
  if (matches.length === 1) return matches[0].label;
  return PAYMENT_METHOD_LABEL[backendMethod as PaymentMethod] ?? backendMethod;
}

/** What a quote stores about how its customer plans to pay. */
export interface QuotePaymentChoice {
  expectedPaymentMethod?: string;
  /** The configured method chosen, and its name then (absent on quotes
   * saved with only the type). */
  expectedPaymentMethodId?: string | null;
  expectedPaymentMethodLabel?: string | null;
}

/** The chosen method's id for a picker: the one stored, or — on an older
 * quote with only the type — the single method of that type, if there's
 * just one. */
export function quotePaymentMethodId(
  methods: PaymentMethodConfig[] | undefined,
  quote: QuotePaymentChoice,
): string {
  if (quote.expectedPaymentMethodId) return quote.expectedPaymentMethodId;
  const matches = methods?.filter((m) => m.backendMethod === quote.expectedPaymentMethod) ?? [];
  return matches.length === 1 ? matches[0].id : "";
}

/** The chosen method's name, as the customer saw it when choosing. */
export function quotePaymentMethodName(
  methods: PaymentMethodConfig[] | undefined,
  quote: QuotePaymentChoice,
) {
  return (
    quote.expectedPaymentMethodLabel ?? paymentMethodLabel(methods, quote.expectedPaymentMethod)
  );
}
