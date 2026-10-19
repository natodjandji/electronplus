import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

/** Mirrors the API's CasheaPayment (payments/entities/payment.entity.ts). */
export type CasheaDownPayment =
  | {
      atStore: false;
      methodId: string;
      methodLabel: string;
      amount: number;
      reference?: string;
      proofUrl?: string;
      reportedAt: string;
    }
  | { atStore: true; reportedAt: string };

export interface CasheaPayment {
  payloadId: number;
  checkoutUrl: string;
  total: number;
  orderId?: string;
  returnedAt?: string;
  downPayment?: CasheaDownPayment;
  confirmedAmount?: number;
  confirmedAt?: string;
  cancelledAt?: string;
  cancelError?: string;
}

/** The payment fields the Cashea screens read. */
export interface CasheaPaymentRecord {
  id: string;
  orderId: string;
  method: string;
  status: "pending" | "verified" | "rejected";
  amount: number;
  cashea?: CasheaPayment;
}

/** Cashea's own logo, as its checkout SDK (MIT) draws its button. */
export const CASHEA_LOGO_SRC = "/assets/cashea/cashea-logo.png";

/** Methods a down payment can be paid through online: the ones an admin
 * reconciles against a reference (not cash, which is paid at the store). */
export const ONLINE_DOWN_PAYMENT_METHODS = ["bank_transfer", "pago_movil", "zelle", "other"];

/** Cashea finances people: it needs a cédula (V or E), not a company RIF. */
export function isCasheaTaxIdPrefix(prefix: string): boolean {
  return prefix === "V" || prefix === "E";
}

export function useCasheaConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["payments", "cashea", "config"],
    queryFn: () =>
      apiFetch<{ available: boolean; minAmount: number | null }>("/payments/cashea/config"),
    staleTime: 10 * 60_000,
    enabled: options?.enabled,
  });
}

/** Where a Cashea payment stands, for the buyer and the admin. */
export type CasheaStage = "checkout" | "down-payment" | "reported" | "confirmed" | "closed";

export function casheaStage(payment: CasheaPaymentRecord): CasheaStage {
  if (payment.status === "verified") return "confirmed";
  if (payment.status === "rejected") return "closed";
  if (!payment.cashea?.orderId) return "checkout";
  return payment.cashea.downPayment ? "reported" : "down-payment";
}
