import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/electron-store";
import { cn } from "@/lib/utils";
import { CasheaMark } from "./cashea-mark";

/** Cashea's yellow (see CasheaMark). */
const CASHEA_YELLOW = "bg-[#FDFA3D]";

const STEPS = ["Pagas una inicial", "El resto en cuotas sin interés", "Te lo llevas"];

/**
 * Cashea in the store's catalog, in Cashea's colors and with its logo. What
 * it promises follows what's true: paying with Cashea at the store, and on
 * the web too once Cashea is switched on for online purchases (the API
 * says so — /cashea/status — so the banner changes with no new release).
 */
export function CasheaBanner({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ["cashea", "status"],
    queryFn: () => apiFetch<{ online: boolean; minAmount: number | null }>("/cashea/status"),
    staleTime: 5 * 60_000,
  });
  const online = data?.online ?? false;

  return (
    <section
      aria-label="Paga en cuotas con Cashea"
      className={cn("mx-auto max-w-7xl px-4 sm:px-6", className)}
    >
      <div className={cn("rounded-2xl text-black", CASHEA_YELLOW)}>
        <div className="flex items-center gap-4 p-4 sm:gap-5 sm:p-6">
          <CasheaMark dark className="h-12 w-12 sm:h-14 sm:w-14" />

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">
              {online ? "Paga con Cashea" : "Cashea en nuestra tienda"}
            </p>
            <h2 className="mt-0.5 text-base font-bold leading-snug sm:text-xl">
              Llévatelo hoy y págalo en cuotas sin interés
            </h2>
            {online && (
              <p className="mt-1 text-sm leading-snug text-black/75">
                Elige Cashea al pagar tu pedido
                {data?.minAmount ? ` · compra mínima ${formatMoney(data.minAmount)}` : ""}.
              </p>
            )}
          </div>

          <ol className="hidden shrink-0 items-center gap-2 lg:flex" aria-label="Cómo funciona">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className="flex items-center gap-2 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#FDFA3D] text-[11px] font-bold text-black">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
