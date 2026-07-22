import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

interface BcvRate {
  rate: number;
  date: string;
  source: string;
}

export function useBcvRate() {
  return useQuery({
    queryKey: ["exchange-rate", "bcv"],
    queryFn: () => apiFetch<BcvRate>("/exchange-rate/bcv"),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function formatBs(usd: number, rate: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "VES",
    minimumFractionDigits: 2,
  }).format(usd * rate);
}
