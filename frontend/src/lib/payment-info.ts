// NOTE: bank/Pago Móvil details below are placeholders — swap in the real
// company account info before taking live payments.

export type CheckoutPaymentMethod = "transferencia" | "pago-movil" | "efectivo" | "credito";

/** Maps the checkout's payment method keys to the backend's PaymentMethod enum values. */
export const PAYMENT_METHOD_TO_BACKEND: Record<CheckoutPaymentMethod, string> = {
  transferencia: "bank_transfer",
  "pago-movil": "pago_movil",
  efectivo: "cash",
  credito: "credit_b2b",
};

export interface PaymentMethodInfo {
  id: CheckoutPaymentMethod;
  label: string;
  details: string[];
  needsReference: boolean;
  needsProof: boolean;
}

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  {
    id: "transferencia",
    label: "Transferencia bancaria",
    details: [
      "Banco: Banesco",
      "Cuenta corriente: 0134-0000-00-0000000000",
      "Titular: Electron Plus, C.A.",
      "RIF: J-000000000",
    ],
    needsReference: true,
    needsProof: true,
  },
  {
    id: "pago-movil",
    label: "Pago móvil",
    details: ["Banco: Banesco (0134)", "Teléfono: 0414-0000000", "RIF/Cédula: J-000000000"],
    needsReference: true,
    needsProof: true,
  },
  {
    id: "efectivo",
    label: "Efectivo en tienda",
    details: ["Paga en efectivo al retirar tu pedido en tienda o al recibirlo."],
    needsReference: false,
    needsProof: false,
  },
  {
    id: "credito",
    label: "Crédito B2B (mayoristas)",
    details: ["Se factura a tu línea de crédito aprobada — sin pago inmediato."],
    needsReference: false,
    needsProof: false,
  },
];

export function paymentMethodInfo(id: CheckoutPaymentMethod): PaymentMethodInfo {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}
