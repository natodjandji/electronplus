import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import type { ApiProduct } from "@/lib/product-api";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "Colecciones · Electron Plus" },
      {
        name: "description",
        content: "Explora nuestras categorías: iluminación, cables, tableros, tomas y protección.",
      },
      { property: "og:title", content: "Colecciones · Electron Plus" },
      { property: "og:description", content: "Compra por categoría en Electron Plus." },
    ],
  }),
  component: CollectionsPage,
});

interface Category {
  id: string;
  code: string;
  label: string;
}

function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
  });
}

function CollectionsPage() {
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useQuery({
    queryKey: ["collections", "products"],
    queryFn: () => apiFetch<{ data: ApiProduct[] }>("/products?limit=100"),
    select: (res) => res.data,
  });

  return (
    <PublicShell>
      <section className="relative overflow-hidden border-b border-border bg-white">
        <CircuitBackground className="opacity-70" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Colecciones
          </div>
          <h1 className="mt-1 text-3xl font-bold text-brand-navy">Compra por categoría</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Encuentra justo lo que necesitas para tu proyecto eléctrico, organizado por categoría.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => {
            const items = products.filter((p) => p.category.id === c.id);
            const cover = items[0]?.imageUrl;
            return (
              <Link key={c.id} to="/catalog" search={{ category: c.code }} className="block">
                <Card className="group relative flex h-48 flex-col justify-end overflow-hidden border-border p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(0,86,179,0.25)]">
                  {cover && (
                    <img
                      src={cover}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-30 transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-brand-navy/50 to-brand-navy/10" />
                  <div className="relative">
                    <h3 className="flex items-center gap-1.5 text-lg font-semibold text-white">
                      {c.label}
                      <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </h3>
                    <p className="text-xs text-white/70">
                      {items.length} producto{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </PublicShell>
  );
}
