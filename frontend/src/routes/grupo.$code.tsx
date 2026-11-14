import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Layers, RefreshCw } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ProductImage } from "@/components/product-image";
import { ProductPriceBreakdown } from "@/components/product-price-breakdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { productGroupQuery } from "@/lib/product-groups";
import { absoluteUrl, OG_IMAGE } from "@/lib/site-url";

export const Route = createFileRoute("/grupo/$code")({
  loader: async ({ params, context }) => {
    try {
      return await context.queryClient.fetchQuery(productGroupQuery(params.code));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Grupo no encontrado · Electron Plus" },
          { name: "robots", content: "noindex, follow" },
        ],
      };
    }
    const title = `${loaderData.name} · Electron Plus`;
    const description = `Consulta los productos de ${loaderData.name}, con precios al detal y al mayor y desglose de IVA.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        {
          property: "og:image",
          content: loaderData.products.find((p) => p.image)?.image || OG_IMAGE,
        },
        { property: "og:url", content: absoluteUrl(`/grupo/${params.code}`) },
      ],
      links: [{ rel: "canonical", href: absoluteUrl(`/grupo/${params.code}`) }],
    };
  },
  pendingComponent: () => (
    <PublicShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6" aria-label="Cargando grupo">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-80 w-full" />
      </div>
    </PublicShell>
  ),
  notFoundComponent: GroupNotFound,
  errorComponent: GroupLoadError,
  component: ProductGroupPage,
});

function ProductGroupPage() {
  const group = Route.useLoaderData();

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 text-sm text-brand-blue hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al catálogo
        </Link>
        <div className="mb-8 mt-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-brand-blue">
            <Layers className="h-4 w-4" /> Productos de esta etiqueta
          </div>
          <h1 className="break-words text-3xl font-bold text-brand-navy">{group.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {group.products.length} {group.products.length === 1 ? "producto" : "productos"} · Elige
            la variación que necesitas.
          </p>
        </div>

        {group.products.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Este grupo no tiene productos disponibles en el catálogo en este momento.
          </Card>
        ) : (
          <div className="space-y-8">
            {group.products.map((product) => (
              <article
                key={product.id}
                className="grid min-w-0 grid-cols-1 gap-6 border-b border-border pb-8 last:border-0 md:grid-cols-2 md:gap-8"
              >
                <Card className="self-start overflow-hidden p-0">
                  <div className="aspect-square bg-brand-surface">
                    <ProductImage
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full"
                      iconClassName="h-16 w-16"
                      label="Sin imagen disponible"
                    />
                  </div>
                </Card>
                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-bold text-brand-navy">
                    <Link
                      to="/product/$id"
                      params={{ id: product.id }}
                      className="hover:text-brand-blue"
                    >
                      {product.name}
                    </Link>
                  </h2>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {product.brand && <span className="mr-3">Marca {product.brand}</span>}
                    {product.model && <span>SKU {product.model}</span>}
                  </div>
                  <div className="mt-6">
                    <ProductPriceBreakdown product={product} />
                  </div>
                  <Card className="mt-6 p-5">
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Especificaciones
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-sm text-brand-navy">
                      {product.specs || "Sin especificaciones adicionales."}
                    </p>
                  </Card>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Badge
                      className={
                        product.stock > 0
                          ? "bg-brand-blue/10 text-brand-blue"
                          : "bg-destructive text-white"
                      }
                    >
                      {product.stock > 0 ? "Disponible" : "Agotado"}
                    </Badge>
                    <Button
                      asChild
                      className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                    >
                      <Link to="/product/$id" params={{ id: product.id }}>
                        Ver producto <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}

function GroupNotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Grupo no encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta etiqueta ya no está disponible. Consulta los productos en nuestro catálogo.
        </p>
        <Button asChild className="mt-6 bg-brand-blue text-white hover:bg-brand-blue/90">
          <Link to="/catalog">Ir al catálogo</Link>
        </Button>
      </div>
    </PublicShell>
  );
}

function GroupLoadError() {
  const router = useRouter();
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center" role="alert">
        <h1 className="text-2xl font-bold text-brand-navy">No pudimos cargar este grupo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisa tu conexión y vuelve a intentarlo.
        </p>
        <Button
          onClick={() => void router.invalidate()}
          className="mt-6 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    </PublicShell>
  );
}
