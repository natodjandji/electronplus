import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Zap, Truck, ShieldCheck, Tag, Search, ShoppingCart } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PriceTag } from "@/components/price-tag";
import { PRODUCTS } from "@/lib/mock-data";

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
    ],
  }),
  component: Home,
});

function Home() {
  const featured = PRODUCTS.slice(0, 4);
  return (
    <PublicShell>
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
            <div className="relative grid grid-cols-2 gap-3">
              {featured.slice(0, 4).map((p, i) => (
                <div
                  key={p.id}
                  className={`rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm ${
                    i % 2 === 1 ? "translate-y-6" : ""
                  }`}
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-white">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="mt-2 text-xs font-medium text-white/90 line-clamp-1">
                    {p.name}
                  </div>
                </div>
              ))}
            </div>
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
          {featured.map((p) => (
            <Card
              key={p.id}
              className="overflow-hidden border-border p-0 shadow-sm transition hover:shadow-md"
            >
              <div className="aspect-square overflow-hidden bg-brand-surface">
                <img
                  src={p.image}
                  alt={p.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {p.sku}
                </div>
                <div className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold text-brand-navy">
                  {p.name}
                </div>
                <div className="mt-3">
                  <PriceTag product={p} size="sm" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
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
