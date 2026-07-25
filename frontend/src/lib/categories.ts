import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api-client";

export interface Category {
  id: string;
  code: string;
  label: string;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
  });
}
