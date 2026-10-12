import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, MessageCircle, Printer } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { QuoteDocument } from "@/components/seller/quote-document";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { CONTACT_INFO } from "@/lib/contact-info";
import { useElectronStore } from "@/lib/electron-store";
import { formatQuoteNumber, type SharedQuote } from "@/lib/sales-carts";

export const Route = createFileRoute("/cotizacion/$token")({
  validateSearch: (search: Record<string, unknown>): { imprimir?: boolean; carrito?: string } => ({
    imprimir: search.imprimir === true || search.imprimir === "true" ? true : undefined,
    carrito: typeof search.carrito === "string" ? search.carrito : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cotización · Electron Plus" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharedQuotePage,
});

/**
 * The quote a seller shared: anyone with the link can open and print it,
 * no account needed. `?imprimir` opens the print dialog once it loads
 * (the seller's "Imprimir cotización"); `?carrito` gives the seller a
 * way back to the cart.
 */
function SharedQuotePage() {
  const { token } = Route.useParams();
  const { imprimir, carrito } = Route.useSearch();
  const { canSell } = useElectronStore();
  const {
    data: quote,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["shared-quote", token],
    queryFn: () => apiFetch<SharedQuote>(`/shared-quotes/${token}`),
    retry: false,
  });

  const printed = useRef(false);
  useEffect(() => {
    if (!imprimir || !quote || printed.current) return;
    printed.current = true;
    // Let the logo and QR image paint before the print snapshot is taken.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [imprimir, quote]);

  const expired = quote ? new Date(quote.validUntil).getTime() < Date.now() : false;

  return (
    <PublicShell>
      <style>{"@page { size: letter; margin: 14mm; }"}</style>
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          {carrito && canSell && (
            <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
              <Link to="/vendedor/carrito/$id" params={{ id: carrito }}>
                <ArrowLeft className="h-4 w-4" /> Volver al carrito
              </Link>
            </Button>
          )}
          {quote && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimir o guardar PDF
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                asChild
              >
                <a
                  href={`${CONTACT_INFO.whatsappHref}?text=${encodeURIComponent(
                    `Hola, les escribo por la cotización N.º ${formatQuoteNumber(quote.number)}.`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-4 w-4" /> Escríbenos
                </a>
              </Button>
            </div>
          )}
        </div>

        {expired && (
          <Card className="mb-4 flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Esta cotización ya venció. Los precios o la disponibilidad pueden haber cambiado:
            escríbenos para actualizarla.
          </Card>
        )}

        {isLoading && <Skeleton className="h-[32rem] w-full rounded-2xl" />}
        {isError && (
          <Card className="p-10 text-center">
            <div className="text-sm font-semibold text-brand-navy">Cotización no encontrada</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisa que el enlace esté completo o pide uno nuevo a quien te atendió.
            </p>
          </Card>
        )}
        {quote && <QuoteDocument quote={quote} />}
      </section>
    </PublicShell>
  );
}
