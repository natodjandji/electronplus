import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Store } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CasheaButton } from "@/components/cashea-button";
import { CasheaDownPaymentForm } from "@/components/cashea-down-payment";
import { EASE_OUT_QUINT } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { casheaStage, useCasheaConfig, type CasheaPaymentRecord } from "@/lib/cashea";
import { formatMoney } from "@/lib/electron-store";

/** Where Cashea sends the buyer back: /cashea/retorno/{orderId}?idNumber=…
 * when the purchase was approved, without it when they left midway. */
export const Route = createFileRoute("/cashea/retorno/$orderId")({
  validateSearch: (search: Record<string, unknown>): { idNumber?: string } => {
    const raw = search.idNumber;
    return {
      idNumber: typeof raw === "string" || typeof raw === "number" ? String(raw) : undefined,
    };
  },
  head: () => ({
    meta: [{ title: "Pago con Cashea · Electron Plus" }, { name: "robots", content: "noindex" }],
  }),
  component: CasheaReturnPage,
});

interface OrderSummary {
  id: string;
  totalAmount: number;
  fulfillmentMethod?: "delivery" | "pickup";
}

function CasheaReturnPage() {
  const { orderId } = Route.useParams();
  const { idNumber } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();

  // Coming back with the same number again is harmless on the API side,
  // so this can simply refetch after the down payment is reported.
  const result = useQuery({
    queryKey: ["cashea", "return", orderId, idNumber ?? ""],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const payment = idNumber
        ? await apiFetch<CasheaPaymentRecord>(`/payments/order/${orderId}/cashea/return`, {
            method: "POST",
            body: { idNumber },
          })
        : (await apiFetch<CasheaPaymentRecord[]>(`/payments/order/${orderId}`))[0];
      const order = await apiFetch<OrderSummary>(`/orders/${orderId}`);
      return { payment, order };
    },
  });

  let body: ReactNode;
  if (authLoading || (user && result.isLoading)) {
    body = (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Revisando tu compra con Cashea…
      </div>
    );
  } else if (!user) {
    const here = `/cashea/retorno/${orderId}${idNumber ? `?idNumber=${idNumber}` : ""}`;
    body = (
      <Notice title="Inicia sesión para continuar" icon={Clock}>
        Entra con la cuenta con la que hiciste el pedido para terminar tu compra con Cashea.
        <Button className="mt-4 bg-brand-blue text-white hover:bg-brand-blue/90" asChild>
          <Link to="/login" search={{ redirect: here }}>
            Iniciar sesión
          </Link>
        </Button>
      </Notice>
    );
  } else if (result.isError || !result.data?.payment?.cashea) {
    body = (
      <Notice title="No pudimos revisar tu compra" icon={AlertTriangle} tone="warning">
        {result.error instanceof ApiError
          ? result.error.message
          : "Este pedido no se está pagando con Cashea."}
        <MyOrdersButton />
      </Notice>
    );
  } else {
    body = <CasheaStatus payment={result.data.payment} order={result.data.order} />;
  }

  return (
    <PublicShell>
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">{body}</section>
    </PublicShell>
  );
}

function CasheaStatus({ payment, order }: { payment: CasheaPaymentRecord; order: OrderSummary }) {
  const [editing, setEditing] = useState(false);
  const { data: casheaConfig } = useCasheaConfig();
  const cashea = payment.cashea!;
  const stage = casheaStage(payment);
  const pickup = order.fulfillmentMethod === "pickup";
  const reference = `Pedido #${order.id.slice(0, 8).toUpperCase()}`;

  if (stage === "checkout") {
    return (
      <Notice title="Tu compra con Cashea no se completó" icon={Clock} tone="warning">
        Tu pedido sigue apartado. Vuelve a Cashea para elegir tu plan, o cambia el método de pago
        desde tus pedidos.
        <div className="mt-6">
          <CasheaButton
            label="Volver a Cashea"
            minAmount={casheaConfig?.minAmount}
            onClick={() => window.location.assign(cashea.checkoutUrl)}
          />
        </div>
        <MyOrdersButton variant="ghost" />
      </Notice>
    );
  }
  if (stage === "confirmed") {
    return (
      <Notice title="Tu pago con Cashea está confirmado" icon={CheckCircle2} tone="success">
        Recibimos tu inicial y Cashea financia el resto. Te avisaremos por correo cuando tu pedido
        avance.
        <MyOrdersButton />
      </Notice>
    );
  }
  if (stage === "closed") {
    return (
      <Notice title="Este pago con Cashea fue cancelado" icon={AlertTriangle} tone="warning">
        Puedes elegir otro método de pago desde tus pedidos.
        <MyOrdersButton />
      </Notice>
    );
  }

  const report = cashea.downPayment;
  return (
    <div className="space-y-5">
      <Notice title="¡Cashea aprobó tu compra!" icon={CheckCircle2} tone="success">
        Orden de Cashea #{cashea.orderId} · {reference} · Total {formatMoney(order.totalAmount)}
      </Notice>

      <Card className="p-5 sm:p-6">
        {stage === "reported" && report && !editing ? (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-semibold text-brand-navy">
              {report.atStore
                ? "Pagarás la inicial en la tienda"
                : "Recibimos tu pago de la inicial"}
            </h2>
            <p className="text-muted-foreground">
              {report.atStore ? (
                <>
                  <Store className="mr-1 inline h-4 w-4 align-[-3px] text-brand-blue" />
                  Pagas la inicial al retirar tu pedido y te lo entregamos en ese momento.
                </>
              ) : (
                <>
                  {formatMoney(report.amount)} por {report.methodLabel}
                  {report.reference ? ` (referencia ${report.reference})` : ""}. Lo verificamos y te
                  avisamos por correo cuando tu pedido esté confirmado.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <MyOrdersButton inline />
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Corregir
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-brand-navy">Paga la inicial</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                El monto de la inicial es el que te indicó Cashea en tu plan de pagos.
                {pickup
                  ? " Puedes pagarla ahora o al retirar tu pedido."
                  : " Págala ahora para que preparemos tu envío."}
              </p>
            </div>
            <CasheaDownPaymentForm
              payment={payment}
              pickup={pickup}
              onSent={() => setEditing(false)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

const TONE = {
  neutral: "bg-brand-blue/10 text-brand-blue",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
} as const;

function Notice({
  title,
  icon: Icon,
  tone = "neutral",
  children,
}: {
  title: string;
  icon: typeof Clock;
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.32, ease: EASE_OUT_QUINT }}
    >
      <Card className="p-6 text-center sm:p-8">
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${TONE[tone]}`}>
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-brand-navy sm:text-2xl">{title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      </Card>
    </motion.div>
  );
}

function MyOrdersButton({
  variant = "default",
  inline = false,
}: {
  variant?: "default" | "ghost";
  inline?: boolean;
}) {
  return (
    <Button
      variant={variant === "ghost" ? "ghost" : "default"}
      className={`${inline ? "" : "mt-4"} ${
        variant === "ghost" ? "" : "bg-brand-blue text-white hover:bg-brand-blue/90"
      }`}
      asChild
    >
      <Link to="/client/orders">Ver mis pedidos</Link>
    </Button>
  );
}
