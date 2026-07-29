import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

/** The backend's PaymentMethod enum (payments/entities/payment.entity.ts),
 * mirrored here since there's no shared package between backend and
 * frontend in this repo. */
export type PaymentMethod =
  | "bank_transfer"
  | "pago_movil"
  | "cash"
  | "zelle"
  | "paypal"
  | "credit_b2b"
  | "other";

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
  credit_b2b: "Crédito B2B",
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
  return methods?.find((m) => m.backendMethod === backendMethod)?.label ?? backendMethod;
}
