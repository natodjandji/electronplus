import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Package, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/price-tag";
import { QrBlock } from "@/components/qr-block";
import { PRODUCTS } from "@/lib/mock-data";
import { useElectronStore } from "@/lib/electron-store";

export const Route = createFileRoute("/product/qr/$id")({
  loader: ({ params }) => {
    const product = PRODUCTS.find((p) => p.id === params.id);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} · Electron Plus` },
          { name: "description", content: loaderData.product.specs },
          { property: "og:title", content: `${loaderData.product.name} · Electron Plus` },
          { property: "og:description", content: loaderData.product.specs },
          { property: "og:image", content: loaderData.product.image },
          { name: "twitter:image", content: loaderData.product.image },
        ]
      : [{ title: "Producto · Electron Plus" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: NotFound,
  component: QrProductPage,
});

function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Producto no encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">El código QR escaneado no coincide con ningún producto.</p>
        <Link to="/catalog">
          <Button className="mt-6 bg-brand-blue text-white hover:bg-brand-blue/90">Ir al catálogo</Button>
        </Link>
      </div>
    </PublicShell>
  );
}

function QrProductPage() {
  const { product } = Route.useLoaderData();
  const { isOps, role } = useElectronStore();
  const out = product.stock === 0;
  const low = product.stock > 0 && product.stock <= 10;

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/catalog" className="inline-flex items-center gap-2 text-sm text-brand-blue hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver al catálogo
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="aspect-square bg-brand-surface">
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            </div>
          </Card>

          <div>
            {isOps && (
              <div className="flex items-center gap-2">
                <Badge className="bg-brand-navy text-white">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  {role === "admin" ? "Vista administrador" : "Vista almacén"}
                </Badge>
              </div>
            )}
            <h1 className="mt-2 text-3xl font-bold text-brand-navy">{product.name}</h1>
            <div className="mt-1 text-xs text-muted-foreground">SKU {product.sku}</div>

            <div className="mt-6">
              <PriceTag product={product} size="lg" />
            </div>

            <Card className="mt-6 p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Especificaciones
              </div>
              <p className="mt-1 text-sm text-brand-navy">{product.specs}</p>
            </Card>

            {isOps ? (
              <Card className="mt-4 border-brand-navy/20 bg-brand-navy p-5 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-brand-yellow">
                  Información interna
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={Package} label="Stock disponible" value={`${product.stock} uds`} />
                  <InfoRow icon={MapPin} label="Ubicación física" value={product.warehouse} />
                </div>
              </Card>
            ) : (
              <Card className="mt-4 p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Disponibilidad
                </div>
                <div className="mt-2">
                  {out && <Badge className="bg-destructive text-white">Agotado</Badge>}
                  {low && <Badge className="bg-brand-yellow text-brand-navy">Últimas unidades</Badge>}
                  {!out && !low && <Badge className="bg-brand-blue/10 text-brand-blue">Disponible</Badge>}
                </div>
              </Card>
            )}

            {isOps && (
              <div className="mt-6 flex items-center gap-4">
                <div className="rounded-md border border-border bg-white p-2">
                  <QrBlock seed={`electron-plus:${product.id}`} size={104} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Código QR único de este producto.
                  <br />
                  Ruta: <code className="text-brand-navy">/product/qr/{product.id}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-brand-yellow">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/60">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
