import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { PublicShell } from "@/components/public-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/price-tag";
import { ProductImage } from "@/components/product-image";
import { BuyNowPaypalButton } from "@/components/buy-now-paypal-button";
import { apiFetch } from "@/lib/api-client";
import { type ApiProduct, toProduct } from "@/lib/product-api";
import { useElectronStore } from "@/lib/electron-store";
import { formatBs, useBcvRate } from "@/lib/use-bcv-rate";
import { absoluteUrl } from "@/lib/site-url";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ params }) => {
    try {
      const raw = await apiFetch<ApiProduct>(`/products/${params.id}`);
      return { product: toProduct(raw) };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} · Electron Plus` },
          { name: "description", content: loaderData.product.specs },
          { property: "og:title", content: `${loaderData.product.name} · Electron Plus` },
          { property: "og:description", content: loaderData.product.specs },
          { property: "og:image", content: loaderData.product.image },
          { property: "og:url", content: absoluteUrl(`/product/${params.id}`) },
          { name: "twitter:image", content: loaderData.product.image },
        ]
      : [{ title: "Producto · Electron Plus" }, { name: "robots", content: "noindex" }],
    links: loaderData
      ? [{ rel: "canonical", href: absoluteUrl(`/product/${params.id}`) }]
      : undefined,
  }),
  notFoundComponent: NotFound,
  component: ProductPage,
});

interface SecondStoreProduct {
  id: string;
  name: string;
  stock: number;
  linkedProduct: { id: string; sku: string; name: string; stock: number } | null;
}

function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-brand-navy">Producto no encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El código QR escaneado no coincide con ningún producto.
        </p>
        <Link to="/catalog">
          <Button className="mt-6 bg-brand-blue text-white hover:bg-brand-blue/90">
            Ir al catálogo
          </Button>
        </Link>
      </div>
    </PublicShell>
  );
}

function ProductPage() {
  const { product } = Route.useLoaderData();
  const { isOps, role, addToCart } = useElectronStore();
  const { data: bcv } = useBcvRate();
  const { data: qrLabel } = useQuery({
    queryKey: ["qr", "token", product.id],
    queryFn: () =>
      apiFetch<{ qrImageDataUrl: string }>(`/qr/tokens/${product.id}`, { method: "POST" }),
    enabled: isOps,
  });
  const { data: secondStoreProducts } = useQuery({
    queryKey: ["admin", "second-store-products"],
    queryFn: () => apiFetch<SecondStoreProduct[]>("/second-store-products"),
    enabled: isOps,
  });
  const secondStoreLink =
    secondStoreProducts?.find((s) => s.linkedProduct?.id === product.id) ?? null;
  const out = product.stock === 0;
  const low = product.stock > 0 && product.stock <= 10;
  const [qty, setQty] = useState(1);
  const maxQty = product.stock > 0 ? product.stock : 1;

  const handleAddToCart = () => {
    addToCart(product, qty);
    toast.success(`Agregado: ${product.name} (${qty})`);
    setQty(1);
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.specs,
    ...(product.image ? { image: product.image } : {}),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.id}`),
      priceCurrency: "USD",
      price: product.retailPrice,
      availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };

  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 text-sm text-brand-blue hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al catálogo
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <Card className="overflow-hidden p-0">
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
              <p className="mt-1.5 text-xs text-muted-foreground">Precios no incluyen IVA (16%).</p>
              {bcv && (
                <p className="mt-1 text-xs font-medium text-brand-blue">
                  Tasa BCV del día: {formatBs(1, bcv.rate)} por USD
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-md border border-border">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={out}
                  className="grid h-11 w-11 place-items-center hover:bg-brand-surface disabled:opacity-40"
                  aria-label="Restar"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-base font-semibold tabular-nums">{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={out}
                  className="grid h-11 w-11 place-items-center hover:bg-brand-surface disabled:opacity-40"
                  aria-label="Sumar"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button
                className="h-11 flex-1 gap-2 bg-brand-blue text-white hover:bg-brand-blue/90 sm:flex-none sm:px-8"
                disabled={out}
                onClick={handleAddToCart}
              >
                <ShoppingCart className="h-4 w-4" />
                {out ? "No disponible" : "Agregar al carrito"}
              </Button>
              {!out && <BuyNowPaypalButton product={product} />}
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
                  <InfoRow
                    icon={Package}
                    label="Stock tienda principal"
                    value={`${product.stock} uds`}
                  />
                  <InfoRow
                    icon={Store}
                    label="Stock tienda secundaria"
                    value={secondStoreLink ? `${secondStoreLink.stock} uds` : "Sin vincular"}
                  />
                </div>
              </Card>
            ) : (
              <Card className="mt-4 p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Disponibilidad
                </div>
                <div className="mt-2">
                  {out && <Badge className="bg-destructive text-white">Agotado</Badge>}
                  {low && (
                    <Badge className="bg-brand-yellow text-brand-navy">Últimas unidades</Badge>
                  )}
                  {!out && !low && (
                    <Badge className="bg-brand-blue/10 text-brand-blue">Disponible</Badge>
                  )}
                </div>
              </Card>
            )}

            {isOps && (
              <div className="mt-6 flex items-center gap-4">
                <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-md border border-border bg-white p-2">
                  {qrLabel ? (
                    <img
                      src={qrLabel.qrImageDataUrl}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  Mismo código QR que se imprime en la etiqueta del producto.
                  <br />
                  Ruta: <code className="break-all text-brand-navy">/product/qr/{product.id}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
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
