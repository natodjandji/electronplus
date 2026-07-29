import { CheckCircle2, CreditCard, PackageCheck, Store, Truck, Ban, Clock } from "lucide-react";

export type OrderStatus =
  | "pending_payment_verification"
  | "paid"
  | "preparing"
  | "shipped"
  | "ready_for_pickup"
  | "fulfilled"
  | "cancelled";

export type FulfillmentMethod = "delivery" | "pickup";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment_verification: "Procesando pago",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  ready_for_pickup: "Listo para retirar",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment_verification: "border-transparent bg-brand-yellow/25 text-brand-navy",
  paid: "border-transparent bg-brand-blue/10 text-brand-blue",
  preparing: "border-transparent bg-brand-blue/10 text-brand-blue",
  shipped: "border-transparent bg-brand-blue/10 text-brand-blue",
  ready_for_pickup: "border-transparent bg-brand-blue/10 text-brand-blue",
  fulfilled: "border-transparent bg-emerald-100 text-emerald-700",
  cancelled: "border-transparent bg-destructive/10 text-destructive",
};

const DELIVERY_PIPELINE: { status: OrderStatus; label: string; icon: typeof CreditCard }[] = [
  { status: "paid", label: "Pagado", icon: CreditCard },
  { status: "preparing", label: "Preparando", icon: PackageCheck },
  { status: "shipped", label: "Enviado", icon: Truck },
  { status: "fulfilled", label: "Entregado", icon: CheckCircle2 },
];

const PICKUP_PIPELINE: { status: OrderStatus; label: string; icon: typeof CreditCard }[] = [
  { status: "paid", label: "Pagado", icon: CreditCard },
  { status: "preparing", label: "Preparando", icon: PackageCheck },
  { status: "ready_for_pickup", label: "Listo para retirar", icon: Store },
  { status: "fulfilled", label: "Entregado", icon: CheckCircle2 },
];

function pipelineFor(fulfillmentMethod?: FulfillmentMethod) {
  return fulfillmentMethod === "pickup" ? PICKUP_PIPELINE : DELIVERY_PIPELINE;
}

/** Next status after the given one in the fulfillment pipeline, or undefined if there isn't one. */
export function nextOrderStatus(
  status: OrderStatus,
  fulfillmentMethod?: FulfillmentMethod,
): OrderStatus | undefined {
  const pipeline = pipelineFor(fulfillmentMethod);
  const idx = pipeline.findIndex((s) => s.status === status);
  if (idx === -1 || idx === pipeline.length - 1) return undefined;
  return pipeline[idx + 1].status;
}

export function OrderStepper({
  status,
  fulfillmentMethod,
}: {
  status: OrderStatus;
  fulfillmentMethod?: FulfillmentMethod;
}) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
        <Ban className="h-4 w-4" /> Pedido cancelado
      </div>
    );
  }

  if (status === "pending_payment_verification") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md bg-brand-yellow/15 p-3 text-sm font-medium text-brand-navy">
        <Clock className="h-4 w-4" /> Esperando verificación de pago
      </div>
    );
  }

  const PIPELINE = pipelineFor(fulfillmentMethod);
  const currentIdx = PIPELINE.findIndex((s) => s.status === status);

  return (
    <div className="flex items-start">
      {PIPELINE.map((stage, idx) => {
        const done = idx <= currentIdx;
        const isLast = idx === PIPELINE.length - 1;
        const Icon = stage.icon;
        return (
          <div key={stage.status} className={`flex items-start ${isLast ? "" : "flex-1"}`}>
            <div className="flex min-w-0 flex-col items-center gap-1 px-0.5">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  done ? "bg-brand-blue text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={`max-w-[4.5rem] break-words text-center text-[10px] font-medium leading-tight sm:max-w-none sm:whitespace-nowrap sm:text-[11px] ${
                  done ? "text-brand-navy" : "text-muted-foreground"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`mt-4 h-0.5 flex-1 ${idx < currentIdx ? "bg-brand-blue" : "bg-muted"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
