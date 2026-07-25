import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

export interface PaymentMethodConfig {
  id: string;
  backendMethod: string;
  label: string;
  details: string[];
  needsReference: boolean;
  needsProof: boolean;
  enabled: boolean;
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => apiFetch<PaymentMethodConfig[]>("/payment-methods"),
  });
}

export function paymentMethodLabel(
  methods: PaymentMethodConfig[] | undefined,
  backendMethod?: string,
) {
  if (!backendMethod) return undefined;
  return methods?.find((m) => m.backendMethod === backendMethod)?.label ?? backendMethod;
}
