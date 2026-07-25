import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Zap, Truck, ShieldCheck, Tag, Search, ShoppingCart } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { EASE_OUT_QUINT } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceTag } from "@/components/price-tag";
import { ProductImage } from "@/components/product-image";
import { apiFetch } from "@/lib/api-client";
import { type ApiProduct, toProduct } from "@/lib/product-api";
import type { Product } from "@/lib/mock-data";
import { SITE_URL, absoluteUrl } from "@/lib/site-url";

const HERO_GROUP_SIZE = 4;
const HERO_ROTATE_MS = 5000;

/** Cycles through `items` in fixed-size groups every `intervalMs` — used to rotate the
 * hero showcase through best-sellers instead of freezing on the first four. */
function useRotatingGroups<T>(items: T[], groupSize: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  const groupCount = Math.max(1, Math.ceil(items.length / groupSize));

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (groupCount <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % groupCount), intervalMs);
    return () => clearInterval(id);
  }, [groupCount, intervalMs]);

  const start = index * groupSize;
  return { group: items.slice(start, start + groupSize), index };
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Electron Plus · Iluminación y materiales eléctricos" },
      {
        name: "description",
        content:
          "Bombillos LED, cables THHN, breakers, tableros y tomas. Precios detal y mayorista, cotizaciones y despacho a nivel nacional.",
      },
      { property: "og:title", content: "Electron Plus · Todo para tu instalación eléctrica" },
      {
        property: "og:description",
        content:
          "Catálogo con precios detal y mayorista, cotizaciones al instante y despacho nacional.",
      },
      { property: "og:url", content: SITE_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Home,
});

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Electron Plus",
  url: SITE_URL,
  logo: absoluteUrl("/assets/brand/logo-full-color.svg"),
  description:
    "Tienda especializada en iluminación, cables y materiales eléctricos en Venezuela. Precios detal y mayorista, cotizaciones y despacho a nivel nacional.",
};

function Home() {
  const { data: bestSellers = [], isLoading: bestSellersLoading } = useQuery({
    queryKey: ["home", "best-sellers"],
    queryFn: () => apiFetch<ApiProduct[]>("/products/best-sellers?limit=8"),
    select: (data) => data.map(toProduct),
  });
  const { group: heroProducts } = useRotatingGroups(bestSellers, HERO_GROUP_SIZE, HERO_ROTATE_MS);
  const reduceMotion = useReducedMotion();
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #ffb703 0, transparent 40%), radial-gradient(circle at 80% 60%, #0056b3 0, transparent 45%)",
          }}
        />
        <CircuitBackground className="opacity-40 [&_path]:stroke-white" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-1 text-xs font-semibold text-brand-yellow">
              <Zap className="h-3.5 w-3.5" />
              Cotiza gratis y obtén precios especiales
            </div>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
              Todo en electricidad, con un <span className="text-brand-yellow">plus</span> de
              calidad.
            </h1>
            <p className="mt-4 max-w-lg text-white/75">
              Todo lo que necesitas para tu proyecto eléctrico, con despacho seguro a nivel
              nacional.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalog">
                <Button
                  size="lg"
                  className="gap-2 bg-brand-yellow text-brand-navy hover:bg-brand-yellow/90"
                >
                  Ver catálogo <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/quotes">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Armar cotización
                </Button>
              </Link>
            </div>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 text-xs text-white/70">
              <HeroStat icon={Truck} label="Despacho nacional" />
              <HeroStat icon={ShieldCheck} label="Garantía en marca" />
              <HeroStat icon={Tag} label="Cotización gratis" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-brand-blue/30 blur-3xl" />
            {bestSellersLoading ? (
              <div className="relative grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`rounded-2xl border border-white/10 bg-white/5 p-3 ${i % 2 === 1 ? "translate-y-6" : ""}`}
                  >
                    <Skeleton className="aspect-square rounded-xl bg-white/10" />
                    <Skeleton className="mt-2 h-3 w-4/5 bg-white/10" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {heroProducts.map((p, i) => {
                    const restY = i % 2 === 1 ? 24 : 0;
                    return (
                      <motion.div
                        key={p.id}
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: restY + 28, scale: 0.92, filter: "blur(6px)" }
                        }
                        animate={{ opacity: 1, y: restY, scale: 1, filter: "blur(0px)" }}
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.94, filter: "blur(4px)" }
                        }
                        transition={{
                          duration: reduceMotion ? 0.2 : 0.55,
                          delay: reduceMotion ? 0 : i * 0.08,
                          ease: EASE_OUT_QUINT,
                        }}
                      >
                        <Link
                          to="/product/$id"
                          params={{ id: p.id }}
                          className="block rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition-colors hover:border-brand-yellow/40"
                        >
                          <div className="aspect-square overflow-hidden rounded-xl bg-white">
                            <ProductImage src={p.image} alt={p.name} className="h-full w-full" />
                          </div>
                          <div className="mt-2 text-xs font-medium text-white/90 line-clamp-1">
                            {p.name}
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Search,
              title: "Explora y elige",
              desc: "Navega el catálogo completo con fotos, especificaciones y disponibilidad al instante.",
            },
            {
              icon: ShoppingCart,
              title: "Compra en línea",
              desc: "Agrega al carrito, elige tu forma de pago y confirma tu pedido en minutos.",
            },
            {
              icon: Truck,
              title: "Recibe y da seguimiento",
              desc: "Consulta el estado de tu pedido en tiempo real, desde la compra hasta la entrega.",
            },
          ].map((f) => (
            <Card key={f.title} className="border-border p-6 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-yellow text-brand-navy">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-brand-navy">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
              Destacados
            </div>
            <h2 className="text-2xl font-bold text-brand-navy sm:text-3xl">
              Los más vendidos esta semana
            </h2>
          </div>
          <Link
            to="/catalog"
            className="hidden text-sm font-medium text-brand-blue hover:underline sm:block"
          >
            Ver todo →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bestSellersLoading
            ? [0, 1, 2, 3].map((i) => <FeaturedProductSkeleton key={i} />)
            : bestSellers.slice(0, 4).map((p) => <FeaturedProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </PublicShell>
  );
}

function FeaturedProductSkeleton() {
  return (
    <Card className="overflow-hidden border-border p-0 shadow-sm">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-4">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-2/3" />
        <Skeleton className="mt-3 h-5 w-20" />
      </div>
    </Card>
  );
}

function FeaturedProductCard({ product }: { product: Product }) {
  const navigate = useNavigate();
  const go = () => navigate({ to: "/product/$id", params: { id: product.id } });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
      className="group cursor-pointer overflow-hidden border-border p-0 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-blue/40 hover:shadow-[0_8px_30px_-8px_rgba(0,86,179,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <div className="aspect-square overflow-hidden bg-brand-surface">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
      <div className="p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {product.sku}
        </div>
        <div className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold text-brand-navy">
          {product.name}
        </div>
        <div className="mt-3">
          <PriceTag product={product} size="sm" />
        </div>
      </div>
    </Card>
  );
}

function HeroStat({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10">
        <Icon className="h-4 w-4 text-brand-yellow" />
      </div>
      <span>{label}</span>
    </div>
  );
}
