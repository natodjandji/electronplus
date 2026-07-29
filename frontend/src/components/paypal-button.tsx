import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder: () => Promise<string>;
        onApprove: () => Promise<void>;
        onError?: (err: unknown) => void;
        onCancel?: () => void;
      }) => { render: (container: HTMLElement) => void };
    };
  }
}

const SCRIPT_ID = "paypal-sdk-script";

/** Loads the PayPal JS SDK once per page and resolves when window.paypal is
 * ready — every mount of PayPalButton (e.g. remounting after a failed
 * capture) reuses the same <script> tag instead of injecting duplicates. */
function loadPaypalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => existing.addEventListener("load", () => resolve()));
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar PayPal"));
    document.body.appendChild(script);
  });
}

/**
 * The order + a PENDING payment already exist server-side by the time this
 * renders (checkout.tsx creates them up front, same as every other payment
 * method) — createOrder below just hands the existing PayPal order id back
 * to the SDK instead of creating a new one, PayPal's own documented pattern
 * for a server-side-first integration. onApprove calls our capture endpoint,
 * which is what actually marks the payment verified and the order paid.
 */
export function PayPalButton({
  clientId,
  paypalOrderId,
  onCaptured,
  onError,
}: {
  clientId: string;
  paypalOrderId: string;
  onCaptured: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadPaypalSdk(clientId)
      .then(() => {
        if (cancelled || !containerRef.current || !window.paypal) return;
        containerRef.current.innerHTML = "";
        window.paypal
          .Buttons({
            createOrder: () => Promise.resolve(paypalOrderId),
            onApprove: async () => {
              await onCaptured();
            },
            onError: (err) => {
              onError(err instanceof Error ? err.message : "El pago con PayPal fue rechazado");
            },
            onCancel: () => {
              onError("Pago con PayPal cancelado");
            },
          })
          .render(containerRef.current);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) onError("No se pudo cargar PayPal");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, paypalOrderId]);

  return (
    <div>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando PayPal…
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
