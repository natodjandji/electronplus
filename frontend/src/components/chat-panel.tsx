import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Send, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { type Product } from "@/lib/mock-data";
import { apiFetch } from "@/lib/api-client";
import { type ApiProduct, toProduct } from "@/lib/product-api";
import { useCategories } from "@/lib/categories";
import { useElectronStore, formatMoney } from "@/lib/electron-store";
import {
  buildReply,
  welcomeReply,
  type QuickReply,
  type ExternalLink,
  type BotReplyContent,
} from "@/lib/chat-bot";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/product-image";
import { EASE_OUT_QUINT } from "@/components/motion-primitives";

type ChatMessage = BotReplyContent & { id: string; from: "bot" | "user" };

function toMessage(content: BotReplyContent): ChatMessage {
  return { id: crypto.randomUUID(), from: "bot", ...content };
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const store = useElectronStore();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [toMessage(welcomeReply())]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mounted unconditionally in PublicShell (open just toggles visibility),
  // so gate the fetch on `open` — most visitors never open the assistant,
  // and shouldn't cost a products+categories fetch on every page load just
  // because it's sitting there. Shared queryKey with catalog.tsx /
  // collections.tsx / quotes.tsx — if the page already loaded the list
  // before the widget opens, this reuses that cache instead of refetching.
  const { data: productsResp } = useQuery({
    queryKey: ["products", "list"],
    queryFn: () => apiFetch<{ data: ApiProduct[] }>("/products?limit=100"),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const { data: categories } = useCategories({ enabled: open });
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
            formatMoney,
          }).map(toMessage),
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
        // Grows out of the mascot it's anchored to (origin bottom-right), not
        // from its own center; scale starts at 0.94, never 0. Exit is a
        // quicker fade so closing never feels like waiting.
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.96,
            y: 4,
            transition: { duration: 0.14, ease: EASE_OUT_QUINT },
          }}
          transition={{ type: "spring", duration: 0.32, bounce: 0.12 }}
          style={{ transformOrigin: "bottom right" }}
          className="pointer-events-auto flex h-[min(560px,70dvh)] w-[min(360px,90vw)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-brand-blue px-4 py-3">
            <img src="/mascot/mascot-idle.webp" alt="" className="h-9 w-9 object-contain" />
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
                src={p.thumbnail}
                alt={p.name}
                className="h-12 w-12 shrink-0 rounded-lg"
                iconClassName="h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to="/product/$id"
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
