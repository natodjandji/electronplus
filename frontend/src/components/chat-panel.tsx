import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Send, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { type Product } from "@/lib/mock-data";
import { apiFetch } from "@/lib/api-client";
import { type ApiProduct, toProduct } from "@/lib/product-api";
import { useElectronStore, formatMoney } from "@/lib/electron-store";
import { CONTACT_INFO } from "@/lib/contact-info";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/product-image";

type QuickReply = { label: string; send: string };
type ExternalLink = { label: string; href: string };

type ChatMessage = {
  id: string;
  from: "bot" | "user";
  text?: string;
  quickReplies?: QuickReply[];
  links?: ExternalLink[];
  products?: Product[];
};

interface ChatCategory {
  id: string;
  code: string;
  label: string;
}

const MAIN_MENU: QuickReply[] = [
  { label: "🔎 Buscar productos", send: "buscar productos" },
  { label: "🧾 Cotizaciones", send: "quiero una cotización" },
  { label: "💲 Precios detal/mayorista", send: "precios mayorista y detal" },
  { label: "📦 Mi pedido", send: "estado de mi pedido" },
  { label: "🚚 Envíos y garantía", send: "envíos y garantía" },
  { label: "☎️ Hablar con un asesor", send: "hablar con un asesor" },
];

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function searchProducts(
  normalizedText: string,
  products: Product[],
  categoryLabel: Record<string, string>,
): Product[] {
  const tokens = normalizedText.split(/\s+/).filter((w) => w.length >= 3);
  if (!tokens.length) return [];
  const scored = products
    .map((p) => {
      const haystack = normalize(
        `${p.name} ${p.sku} ${p.specs} ${categoryLabel[p.category] ?? ""}`,
      );
      const hits = tokens.filter((tok) => haystack.includes(tok)).length;
      return { p, hits };
    })
    .filter((x) => x.hits > 0);
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 3).map((x) => x.p);
}

function welcomeMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    from: "bot",
    text: "¡Hola! Soy el asistente de Electron+. Puedo ayudarte a buscar productos, armar una cotización, revisar precios o ponerte en contacto con nuestro equipo. ¿En qué te ayudo?",
    quickReplies: MAIN_MENU,
  };
}

type Ctx = {
  role: ReturnType<typeof useElectronStore>["role"];
  cartCount: number;
  cartTotal: number;
  products: Product[];
  categoryLabel: Record<string, string>;
};

function buildReply(raw: string, ctx: Ctx): ChatMessage[] {
  const t = normalize(raw);
  const bot = (partial: Omit<ChatMessage, "id" | "from">): ChatMessage[] => [
    { id: crypto.randomUUID(), from: "bot", ...partial },
  ];

  if (!t) return [];

  if (/^(hola|buenas|hey|buenos dias|buenas tardes|buenas noches)[!., ]*$/.test(t)) {
    return bot({
      text: "¡Hola! ¿Qué necesitas hoy?",
      quickReplies: MAIN_MENU,
    });
  }

  if (t.includes("menu") || t.includes("ayuda") || t.includes("opciones")) {
    return bot({
      text: "Estas son las cosas en las que te puedo ayudar:",
      quickReplies: MAIN_MENU,
    });
  }

  if (t.includes("buscar") && t.includes("producto")) {
    return bot({
      text: "Claro, dime el nombre o la categoría que buscas (ej. 'cable 12 AWG', 'breaker' o 'iluminación') y te muestro opciones del catálogo.",
    });
  }

  if (t.includes("cotiz") || t.includes("presupuesto")) {
    return bot({
      text: "Puedes armar tu solicitud de cotización en la sección Cotizaciones: eliges productos y cantidades, y la envías para que nuestro equipo la revise. Te confirmamos si se aprueba, se rechaza, o si aplica un descuento especial. ¿Te llevo para allá?",
      quickReplies: [
        { label: "🧾 Ir a Cotizaciones", send: "__nav:/quotes" },
        { label: "🔎 Ver catálogo primero", send: "__nav:/catalog" },
      ],
    });
  }

  if (
    t.includes("pedido") ||
    t.includes("orden") ||
    t.includes("seguimiento") ||
    t.includes("mi compra")
  ) {
    return ctx.role === "guest"
      ? bot({
          text: "Inicia sesión para ver el historial y estado de tus pedidos.",
          quickReplies: [{ label: "🔑 Iniciar sesión", send: "__nav:/login" }],
        })
      : bot({
          text: "Puedes ver el estado de todos tus pedidos (procesando, pagado, entregado…) en Mis pedidos.",
          quickReplies: [{ label: "📦 Ver mis pedidos", send: "__nav:/client/orders" }],
        });
  }

  if (
    t.includes("mayorista") ||
    t.includes("detal") ||
    t.includes("precio") ||
    t.includes("descuento") ||
    t.includes("b2b")
  ) {
    return bot({
      text: "El catálogo siempre muestra el precio detal y el precio mayorista de referencia. Para acceder al mayorista (o pedir un descuento especial), envía una solicitud de cotización — nuestro equipo la revisa y te confirma.",
      quickReplies: [
        { label: "🧾 Solicitar cotización", send: "__nav:/quotes" },
        { label: "🔎 Ver catálogo", send: "__nav:/catalog" },
      ],
    });
  }

  if (
    t.includes("envio") ||
    t.includes("despacho") ||
    t.includes("domicilio") ||
    t.includes("delivery")
  ) {
    return bot({
      text: "Hacemos despacho a nivel nacional. Los tiempos y costos varían según destino y volumen — nuestro equipo te confirma el detalle exacto al armar tu pedido.",
    });
  }

  if (t.includes("garantia")) {
    return bot({
      text: "Todos los productos tienen garantía de marca. Si algo llega con falla, contáctanos con tu número de pedido y lo resolvemos con el fabricante o distribuidor.",
    });
  }

  if (t.includes("carrito")) {
    return ctx.cartCount > 0
      ? bot({
          text: `Tienes ${ctx.cartCount} artículo(s) en el carrito por ${formatMoney(ctx.cartTotal)}.`,
          quickReplies: [{ label: "🛒 Ir al carrito", send: "__nav:/cart" }],
        })
      : bot({
          text: "Tu carrito está vacío por ahora.",
          quickReplies: [{ label: "🔎 Ver catálogo", send: "__nav:/catalog" }],
        });
  }

  if (
    t.includes("iniciar sesion") ||
    t.includes("login") ||
    t.includes("registrar") ||
    t.includes("crear cuenta") ||
    t.includes("cuenta")
  ) {
    return bot({
      text: "Puedes iniciar sesión con Google o correo, o crear una cuenta nueva en segundos.",
      quickReplies: [
        { label: "🔑 Iniciar sesión", send: "__nav:/login" },
        { label: "📝 Crear cuenta", send: "__nav:/register" },
      ],
    });
  }

  if (
    t.includes("contacto") ||
    t.includes("humano") ||
    t.includes("asesor") ||
    t.includes("telefono") ||
    t.includes("correo") ||
    t.includes("whatsapp") ||
    t.includes("horario")
  ) {
    return bot({
      text: `Con gusto. Puedes escribirnos directamente:\nHorario: ${CONTACT_INFO.hours}.`,
      links: [
        { label: `✉️ ${CONTACT_INFO.email}`, href: CONTACT_INFO.emailHref },
        { label: `☎️ ${CONTACT_INFO.phone}`, href: CONTACT_INFO.phoneHref },
      ],
    });
  }

  const matches = searchProducts(t, ctx.products, ctx.categoryLabel);
  if (matches.length > 0) {
    return bot({
      text: `Encontré esto en el catálogo para "${raw}":`,
      products: matches,
      quickReplies: [{ label: "🔎 Ver todo en catálogo", send: `__navq:${raw}` }],
    });
  }

  return bot({
    text: "No estoy seguro de haber entendido 🤔 ¿Puedes elegir una opción o intentar con otras palabras?",
    quickReplies: MAIN_MENU,
  });
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const store = useElectronStore();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: productsResp } = useQuery({
    queryKey: ["chat-widget", "products"],
    queryFn: () => apiFetch<{ data: ApiProduct[] }>("/products?limit=100"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categories } = useQuery({
    queryKey: ["chat-widget", "categories"],
    queryFn: () => apiFetch<ChatCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });
  const products = useMemo(() => productsResp?.data.map(toProduct) ?? [], [productsResp]);
  const categoryLabel = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.code, c.label])),
    [categories],
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const respond = (raw: string, { echoAsUser = true } = {}) => {
    if (raw.startsWith("__nav:")) {
      onClose();
      navigate({ to: raw.slice(6) });
      return;
    }
    if (raw.startsWith("__navq:")) {
      onClose();
      navigate({ to: "/catalog", search: { q: raw.slice(7) } });
      return;
    }

    if (echoAsUser) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "user", text: raw }]);
    }
    setTyping(true);
    setTimeout(
      () => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          ...buildReply(raw, {
            role: store.role,
            cartCount: store.cartCount,
            cartTotal: store.cartTotal,
            products,
            categoryLabel,
          }),
        ]);
      },
      380 + Math.random() * 260,
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    respond(trimmed);
  };

  const handleAddToCart = (product: Product) => {
    store.addToCart(product);
    toast.success(`Agregado: ${product.name}`);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        from: "bot",
        text: `Listo, agregué "${product.name}" a tu carrito. ✅`,
      },
    ]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="pointer-events-auto flex h-[min(560px,70vh)] w-[min(360px,90vw)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-brand-navy px-4 py-3">
            <img src="/mascot/mascot-idle.png" alt="" className="h-9 w-9 object-contain" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Asistente Electron+</div>
              <div className="text-xs text-white/60">En línea</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar chat"
              className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto bg-brand-surface px-3 py-3"
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onQuickReply={(qr) => respond(qr.send, { echoAsUser: !qr.send.startsWith("__") })}
                onAddToCart={handleAddToCart}
              />
            ))}
            {typing && (
              <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 items-center gap-2 border-t border-border bg-white p-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              className="flex-1 rounded-full border border-input bg-brand-surface px-3.5 py-2 text-base text-brand-navy outline-none focus:border-brand-blue sm:text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Enviar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MessageBubble({
  message,
  onQuickReply,
  onAddToCart,
}: {
  message: ChatMessage;
  onQuickReply: (qr: QuickReply) => void;
  onAddToCart: (p: Product) => void;
}) {
  const isUser = message.from === "user";
  return (
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
      {message.text && (
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
            isUser
              ? "rounded-br-sm bg-brand-blue text-white"
              : "rounded-bl-sm bg-white text-brand-navy",
          )}
        >
          {message.text}
        </div>
      )}

      {message.products && message.products.length > 0 && (
        <div className="flex w-full max-w-[90%] flex-col gap-2">
          {message.products.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-white p-2 shadow-sm"
            >
              <ProductImage
                src={p.image}
                alt={p.name}
                className="h-12 w-12 shrink-0 rounded-lg"
                iconClassName="h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to="/product/qr/$id"
                  params={{ id: p.id }}
                  className="line-clamp-1 text-xs font-semibold text-brand-navy hover:underline"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-muted-foreground">{formatMoney(p.retailPrice)}</div>
              </div>
              <button
                type="button"
                onClick={() => onAddToCart(p)}
                disabled={p.stock <= 0}
                aria-label={`Agregar ${p.name} al carrito`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-blue text-white disabled:opacity-40"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {message.links && message.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full border border-brand-blue/30 bg-white px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/5"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}

      {message.quickReplies && message.quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.quickReplies.map((qr) => (
            <button
              key={qr.label}
              type="button"
              onClick={() => onQuickReply(qr)}
              className="rounded-full border border-brand-blue/30 bg-white px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue hover:text-white"
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
