import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CARD_IMAGE_ZOOM, CARD_LIFT } from "@/components/card-interaction";
import { cn } from "@/lib/utils";
import { useCategories } from "@/lib/categories";
import { CONTACT_INFO } from "@/lib/contact-info";
import { catalogQuery } from "@/lib/product-api";
import { absoluteUrl } from "@/lib/site-url";

export const Route = createFileRoute("/collections")({
  head: () => ({
    meta: [
      { title: "Categorías de productos eléctricos · Electron Plus" },
      {
        name: "description",
        content:
          "Compra por categoría: iluminación LED, cables, tableros, tomacorrientes y protección eléctrica. Precios detal y mayorista con despacho nacional.",
      },
      { property: "og:title", content: "Categorías de productos eléctricos · Electron Plus" },
      {
        property: "og:description",
        content:
          "Iluminación, cables, tableros, tomas y protección eléctrica. Precios detal y mayorista.",
      },
      { property: "og:url", content: absoluteUrl("/collections") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/collections") }],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const { data: products = [], isLoading } = useQuery({
    ...catalogQuery,
    select: (res) => res.data,
  });
  // Categories that actually have products, each with its items.
  const collections = categories
    .map((c) => ({ c, items: products.filter((p) => p.category.id === c.id) }))
    .filter(({ items }) => items.length > 0);

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
        {!isLoading && !categoriesLoading && collections.length === 0 && (
          <Card className="p-10 text-center">
            <div className="text-sm font-semibold text-brand-navy">
              Estamos cargando nuestro catálogo
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Muy pronto verás aquí todas las categorías. Mientras tanto, escríbenos y te ayudamos a
              cotizar.
            </p>
            <Button asChild className="mt-4 bg-brand-blue text-white hover:bg-brand-blue/90">
              <a href={CONTACT_INFO.whatsappHref} target="_blank" rel="noopener noreferrer">
                Escríbenos por WhatsApp
              </a>
            </Button>
          </Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map(({ c, items }) => {
            const cover = items[0]?.imageUrl;
            return (
              <Link
                key={c.id}
                to="/catalog"
                search={{ category: c.code }}
                className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                <Card
                  className={cn(
                    "relative flex h-48 flex-col justify-end overflow-hidden border-border p-5 shadow-sm",
                    CARD_LIFT,
                  )}
                >
                  {cover && (
                    <img
                      src={cover}
                      alt=""
                      className={cn(
                        "absolute inset-0 h-full w-full object-cover opacity-30",
                        CARD_IMAGE_ZOOM,
                      )}
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-blue/95 via-brand-blue/50 to-brand-blue/10" />
                  <div className="relative">
                    <h3 className="flex items-center gap-1.5 text-lg font-semibold text-white">
                      {c.label}
                      <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 ease-snappy group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
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
