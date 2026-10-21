import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { round2, TAX_RATE } from '../../../common/utils/money';
import type { Product } from '../../products/entities/product.entity';
import { searchCatalog } from './product-search';

/** Most product cards in one go: past this a chat turns into a catalog. */
export const MAX_CARDS = 5;
const MAX_SEARCH_RESULTS = 10;
const LOW_STOCK = 5;

/** What the tools need from the rest of the API, so they can be tested
 * without it. */
export interface SalesToolDeps {
  catalog(): Promise<Product[]>;
  paymentMethods(): Promise<{ label: string; details: string[] }[]>;
  bcvRate(): Promise<{ rate: number; date: string } | null>;
  shippingQuote(state: string, city: string): Promise<{ amount: number; matched: boolean }>;
  siteUrl: string;
  /** Sends the products as cards in the chat. */
  sendProducts(products: Product[]): Promise<void>;
  /** Pauses the assistant in this chat and alerts the staff. */
  handOver(reason: string, summary: string): Promise<void>;
}

const searchInput = z.object({
  consulta: z.string().min(1).max(200),
  limite: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});
const detailsInput = z.object({ id: z.string().min(1).max(100) });
const sendInput = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(MAX_CARDS) });
const infoInput = z.object({
  estado: z.string().max(60).optional(),
  ciudad: z.string().max(60).optional(),
});
const cartInput = z.object({
  productos: z
    .array(
      z.object({ id: z.string().min(1).max(100), cantidad: z.number().int().min(1).max(9999) }),
    )
    .min(1)
    .max(50),
});
const handOverInput = z.object({
  motivo: z.string().min(1).max(300),
  resumen: z.string().min(1).max(1500),
});

export const SALES_TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_productos',
    description:
      'Busca en el catálogo de Electron Plus. Usa palabras clave cortas: tipo de producto, potencia o medida, marca o código (ej. "bombillo led 9w", "cable thhn 12", "breaker 2x20"). Devuelve id, nombre, precio al detal y al mayor en REF (sin IVA) y disponibilidad. Si no hay resultados, prueba con sinónimos o menos palabras.',
    input_schema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Palabras clave a buscar.' },
        limite: {
          type: 'integer',
          description: `Máximo de resultados (1 a ${MAX_SEARCH_RESULTS}, por defecto 6).`,
        },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'ver_producto',
    description:
      'Ficha completa de un producto por su id: especificaciones, precios, disponibilidad y enlace a la web.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'El id que devolvió buscar_productos.' } },
      required: ['id'],
    },
  },
  {
    name: 'enviar_productos',
    description: `Envía al cliente tarjetas de producto con foto, precio y botón a la web. Hasta ${MAX_CARDS} por llamada; elige los más relevantes.`,
    input_schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'ids de buscar_productos, en el orden a mostrar.',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'info_pagos_y_envios',
    description:
      'Métodos de pago aceptados con sus datos, la tasa oficial BCV del día y, si das estado y ciudad, el costo del envío a esa zona.',
    input_schema: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Estado de Venezuela, ej. "Miranda".' },
        ciudad: { type: 'string', description: 'Ciudad o municipio, ej. "Chacao".' },
      },
    },
  },
  {
    name: 'crear_enlace_carrito',
    description:
      'Arma el carrito en la web con estos productos y cantidades y devuelve el enlace para que el cliente pague y elija envío o retiro, más el subtotal, IVA y total. Úsalo cuando el cliente decida comprar.',
    input_schema: {
      type: 'object',
      properties: {
        productos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, cantidad: { type: 'integer' } },
            required: ['id', 'cantidad'],
          },
        },
      },
      required: ['productos'],
    },
  },
  {
    name: 'pasar_a_asesor',
    description:
      'Pasa la conversación a una persona del equipo: dejas de responder en este chat y se avisa al personal. Úsalo cuando el cliente lo pida, esté molesto, quiera comprar al mayor, pagar en tienda o por este chat, o pida algo que no puedes resolver.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Por qué pasa a un asesor, en una línea.' },
        resumen: {
          type: 'string',
          description:
            'Lo que el asesor necesita saber: qué busca el cliente, productos y cantidades, datos ya dados.',
        },
      },
      required: ['motivo', 'resumen'],
    },
  },
];

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  handedOver?: boolean;
}

/** "REF 1.234,50" — the store's customer-facing format (lib/electron-store
 * formatMoney): regulations don't allow advertising prices as USD. */
export function formatRef(amount: number): string {
  return `REF ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

/** Same as the storefront's (lib/use-bcv-rate formatBs). */
export function formatBs(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function availability(stock: number): 'disponible' | 'pocas unidades' | 'agotado' {
  if (stock <= 0) return 'agotado';
  return stock <= LOW_STOCK ? 'pocas unidades' : 'disponible';
}

export function productUrl(siteUrl: string, id: string): string {
  return `${siteUrl.replace(/\/$/, '')}/product/${encodeURIComponent(id)}`;
}

/** The web cart pre-filled with these lines (see the cart page's `agregar`). */
export function cartUrl(siteUrl: string, lines: { id: string; qty: number }[]): string {
  const items = lines.map((l) => `${encodeURIComponent(l.id)}:${l.qty}`).join(',');
  return `${siteUrl.replace(/\/$/, '')}/cart?agregar=${items}`;
}

function summary(p: Product) {
  return {
    id: p.id,
    nombre: p.name,
    marca: p.brand ?? null,
    codigo: p.sku,
    categoria: p.category?.label ?? null,
    precio_ref: p.retailPrice,
    precio_mayor_ref: p.wholesalePrice,
    disponibilidad: availability(p.stock),
    unidades: Math.max(0, p.stock),
  };
}

const json = (value: unknown): ToolOutcome => ({ content: JSON.stringify(value) });
const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

/** Runs one tool call. Input comes from the model, so it is validated here;
 * a bad call answers with an error the model can correct. */
export async function runSalesTool(
  name: string,
  input: unknown,
  deps: SalesToolDeps,
): Promise<ToolOutcome> {
  switch (name) {
    case 'buscar_productos': {
      const args = searchInput.safeParse(input);
      if (!args.success) return fail('Entrada inválida: falta "consulta".');
      const found = searchCatalog(await deps.catalog(), args.data.consulta, args.data.limite ?? 6);
      // Said here too, where it applies: an empty search is no license to
      // answer "yes, we carry that" from general knowledge.
      if (found.length === 0) {
        return json({
          total: 0,
          resultados: [],
          nota: 'Sin resultados en el catálogo. No digas que tenemos este producto. Prueba sinónimos o menos palabras; si sigue sin aparecer, ofrece pasar con un asesor.',
        });
      }
      return json({ total: found.length, resultados: found.map(summary) });
    }
    case 'ver_producto': {
      const args = detailsInput.safeParse(input);
      if (!args.success) return fail('Entrada inválida: falta "id".');
      const product = (await deps.catalog()).find((p) => p.id === args.data.id);
      if (!product) return fail(`No hay ningún producto activo con id ${args.data.id}.`);
      return json({
        ...summary(product),
        especificaciones: product.specs ?? null,
        tiene_foto: Boolean(product.imageUrl),
        enlace: productUrl(deps.siteUrl, product.id),
      });
    }
    case 'enviar_productos': {
      const args = sendInput.safeParse(input);
      if (!args.success)
        return fail(`Entrada inválida: "ids" debe tener entre 1 y ${MAX_CARDS} ids.`);
      const byId = new Map((await deps.catalog()).map((p) => [p.id, p]));
      const products = [...new Set(args.data.ids)]
        .map((id) => byId.get(id))
        .filter((p): p is Product => !!p);
      const missing = args.data.ids.filter((id) => !byId.has(id));
      if (products.length === 0) return fail('Ninguno de esos ids es un producto activo.');
      await deps.sendProducts(products);
      return json({ enviados: products.map((p) => p.name), no_encontrados: missing });
    }
    case 'info_pagos_y_envios': {
      const args = infoInput.safeParse(input ?? {});
      if (!args.success) return fail('Entrada inválida.');
      const [methods, rate] = await Promise.all([deps.paymentMethods(), deps.bcvRate()]);
      const { estado, ciudad } = args.data;
      const shipping =
        estado && ciudad
          ? await deps.shippingQuote(estado, ciudad).then((q) =>
              q.matched
                ? { estado, ciudad, costo_ref: q.amount }
                : {
                    estado,
                    ciudad,
                    costo_ref: null,
                    nota: 'Sin tarifa cargada para esa zona: un asesor la confirma.',
                  },
            )
          : null;
      return json({
        metodos_de_pago: methods.map((m) => ({ nombre: m.label, datos: m.details })),
        tasa_bcv: rate ? { bs_por_ref: rate.rate, fecha: rate.date } : null,
        envio: shipping,
        entregas: ['Retiro en tienda (Chacao)', 'Delivery en Caracas', 'Envíos a todo el país'],
      });
    }
    case 'crear_enlace_carrito': {
      const args = cartInput.safeParse(input);
      if (!args.success)
        return fail('Entrada inválida: "productos" necesita id y cantidad (entero ≥ 1).');
      const byId = new Map((await deps.catalog()).map((p) => [p.id, p]));
      const lines: { id: string; qty: number }[] = [];
      const warnings: string[] = [];
      const detail: { nombre: string; cantidad: number; precio_ref: number; total_ref: number }[] =
        [];
      for (const { id, cantidad } of args.data.productos) {
        const product = byId.get(id);
        if (!product) {
          warnings.push(`El id ${id} no es un producto activo; no se agregó.`);
          continue;
        }
        if (product.stock <= 0) {
          warnings.push(`${product.name} está agotado; no se agregó.`);
          continue;
        }
        const qty = Math.min(cantidad, product.stock);
        if (qty < cantidad)
          warnings.push(`${product.name}: solo hay ${product.stock}, se agregaron ${qty}.`);
        lines.push({ id, qty });
        detail.push({
          nombre: product.name,
          cantidad: qty,
          precio_ref: product.retailPrice,
          total_ref: round2(product.retailPrice * qty),
        });
      }
      if (lines.length === 0) return fail(`No se pudo armar el carrito. ${warnings.join(' ')}`);
      const subtotal = round2(detail.reduce((s, d) => s + d.total_ref, 0));
      const tax = round2(subtotal * TAX_RATE);
      const total = round2(subtotal + tax);
      const rate = await deps.bcvRate();
      return json({
        enlace: cartUrl(deps.siteUrl, lines),
        lineas: detail,
        subtotal_ref: subtotal,
        iva_ref: tax,
        total_ref: total,
        total_bs: rate ? round2(total * rate.rate) : null,
        nota: 'El envío, si aplica, se suma en la web. Los precios pueden cambiar si el cliente paga otro día.',
        advertencias: warnings,
      });
    }
    case 'pasar_a_asesor': {
      const args = handOverInput.safeParse(input);
      if (!args.success) return fail('Entrada inválida: faltan "motivo" y "resumen".');
      await deps.handOver(args.data.motivo, args.data.resumen);
      return {
        content: JSON.stringify({
          ok: true,
          siguiente_paso:
            'Despídete en una o dos oraciones: un asesor le escribirá por este chat. No sigas atendiendo.',
        }),
        handedOver: true,
      };
    }
    default:
      return fail(`Herramienta desconocida: ${name}`);
  }
}
