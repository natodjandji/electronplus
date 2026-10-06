import { type Product } from "@/lib/product";
import { CONTACT_INFO } from "@/lib/contact-info";
import { type UserRole } from "@/lib/electron-store";

/**
 * Rule-based (no LLM — deliberately, to keep this free to run) intent matcher
 * for the storefront chat widget. Tuned for how Venezuelan customers actually
 * type on a phone: missing accents, repeated letters for emphasis ("holaaa"),
 * WhatsApp-style abbreviations ("q", "xq", "tb"), and everyday phrasing for
 * asking a price ("cuanto cuesta", "a como esta") rather than the literal
 * word "precio". Intents are checked in priority order and scored by how
 * many of their keyword phrases appear in the message, with light typo
 * tolerance (edit distance) on single-word keywords.
 */

export type QuickReply = { label: string; send: string };
export type ExternalLink = { label: string; href: string };

export type BotReplyContent = {
  text?: string;
  quickReplies?: QuickReply[];
  links?: ExternalLink[];
  products?: Product[];
};

export type ChatCtx = {
  role: UserRole;
  cartCount: number;
  cartTotal: number;
  products: Product[];
  categoryLabel: Record<string, string>;
  formatMoney: (n: number) => string;
};

export const MAIN_MENU: QuickReply[] = [
  { label: "🔎 Buscar productos", send: "buscar productos" },
  { label: "🧾 Cotizaciones", send: "quiero una cotización" },
  { label: "💲 Precios detal/mayorista", send: "precios mayorista y detal" },
  { label: "📦 Mi pedido", send: "estado de mi pedido" },
  { label: "🚚 Envíos y garantía", send: "envíos y garantía" },
  { label: "☎️ Hablar con un asesor", send: "hablar con un asesor" },
];

export function welcomeReply(): BotReplyContent {
  return {
    text: "¡Hola! Soy el asistente de Electron+. Puedo ayudarte a buscar productos, armar una cotización, revisar precios o ponerte en contacto con nuestro equipo. ¿En qué te ayudo?",
    quickReplies: MAIN_MENU,
  };
}

// ---- Text normalization --------------------------------------------------

function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "holaaaa" -> "holaa" -> collapses any 3+ run to 1. Safe for Spanish: no
 * standard word triples a letter, so this never corrupts real spelling. */
function collapseRepeats(text: string) {
  return text.replace(/(.)\1{2,}/g, "$1");
}

/** Common WhatsApp-speak abbreviations, applied per whole word only (never
 * mid-word) so real words like "paquete" or "experto" are untouched. */
const SLANG: Record<string, string> = {
  q: "que",
  k: "que",
  x: "por",
  xq: "porque",
  pq: "porque",
  tb: "tambien",
  tmb: "tambien",
  tmbn: "tambien",
  dnd: "donde",
  tlf: "telefono",
  tlfno: "telefono",
  bn: "bien",
  porfa: "por favor",
  porfis: "por favor",
  xfa: "por favor",
  uds: "ustedes",
  ola: "hola",
};

function expandSlang(tokens: string[]): string[] {
  return tokens.map((tok) => SLANG[tok] ?? tok).flatMap((tok) => tok.split(" "));
}

export function normalize(text: string) {
  return stripAccents(text).toLowerCase().trim();
}

/** Strips punctuation stuck to the edges of a token ("bombillos?", "¿cuanto")
 * without touching punctuation in the middle ("2.5mm", "12-2") so decimal
 * and gauge notation in product specs survives untouched. */
function stripEdgePunct(tok: string): string {
  return tok.replace(/^[¿¡"'(]+|[?!."',;:)]+$/g, "");
}

/** Normalized text + its slang-expanded tokens, ready for matching. */
function preprocess(raw: string): { t: string; tokens: string[] } {
  const base = collapseRepeats(normalize(raw));
  const rawTokens = base.split(/\s+/).map(stripEdgePunct).filter(Boolean);
  const tokens = expandSlang(rawTokens);
  return { t: tokens.join(" "), tokens };
}

// ---- Light typo tolerance -------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/** Counts how many of `keywords` appear in the message — exact substring for
 * multi-word phrases, exact-or-near (edit distance 1-2) for single words, so
 * a typo like "presio" or "cotisacion" still matches "precio"/"cotizacion". */
function matchScore(t: string, tokens: string[], keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (kw.includes(" ")) {
      if (t.includes(kw)) score++;
      continue;
    }
    if (t.includes(kw)) {
      score++;
      continue;
    }
    // Short common words (e.g. "cuenta", 6 chars) sit only 1 edit away from
    // other short common words ("cuesta") — fuzzy-matching those would
    // misfire constantly, so typo tolerance only kicks in for longer, more
    // distinctive keywords where a stray 1-2 letter typo is unambiguous.
    if (kw.length < 7) continue;
    const maxDist = kw.length >= 10 ? 2 : 1;
    if (
      tokens.some(
        (tok) => Math.abs(tok.length - kw.length) <= maxDist && levenshtein(tok, kw) <= maxDist,
      )
    ) {
      score++;
    }
  }
  return score;
}

// ---- Greeting handling (composes with other intents) ----------------------

const GREETING_RE =
  /^(hola|epa|ep|oye|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|saludos|alo)\b/;

function hasGreetingPrefix(t: string): boolean {
  return GREETING_RE.test(t);
}

function prependGreeting(reply: BotReplyContent): BotReplyContent {
  return { ...reply, text: reply.text ? `¡Hola! ${reply.text}` : reply.text };
}

// ---- Intent table -----------------------------------------------------
// Checked in order; first one that scores > 0 wins (specific intents come
// before more generic ones so a message matching both resolves sensibly).

type Intent = {
  id: string;
  keywords: string[];
  reply: (ctx: ChatCtx) => BotReplyContent;
};

const INTENTS: Intent[] = [
  {
    id: "despedida",
    keywords: [
      "gracias",
      "te agradezco",
      "eso es todo",
      "eso seria todo",
      "nada mas por ahora",
      "nada mas",
      "chao",
      "hasta luego",
      "nos vemos",
    ],
    reply: () => ({
      text: "¡Con gusto! Si necesitas algo más, aquí estoy. 😊",
      quickReplies: MAIN_MENU,
    }),
  },
  {
    id: "menu",
    keywords: ["menu", "ayuda", "opciones", "que puedes hacer", "en que me ayudas", "que ofreces"],
    reply: () => ({
      text: "Estas son las cosas en las que te puedo ayudar:",
      quickReplies: MAIN_MENU,
    }),
  },
  {
    id: "cotizacion",
    keywords: ["cotiz", "presupuesto", "precio especial", "descuento por cantidad"],
    reply: () => ({
      text: "Puedes armar tu solicitud de cotización en la sección Cotizaciones: eliges productos y cantidades, y la envías para que nuestro equipo la revise. Te confirmamos si se aprueba, se rechaza, o si aplica un descuento especial. ¿Te llevo para allá?",
      quickReplies: [
        { label: "🧾 Ir a Cotizaciones", send: "__nav:/quotes" },
        { label: "🔎 Ver catálogo primero", send: "__nav:/catalog" },
      ],
    }),
  },
  {
    id: "pedido",
    keywords: [
      "pedido",
      "orden",
      "seguimiento",
      "mi compra",
      "donde esta mi pedido",
      "cuando llega mi pedido",
      "ya me llego",
      "rastrear",
      "tracking",
      "estatus de mi pedido",
    ],
    reply: (ctx) =>
      ctx.role === "guest"
        ? {
            text: "Inicia sesión para ver el historial y estado de tus pedidos.",
            quickReplies: [{ label: "🔑 Iniciar sesión", send: "__nav:/login" }],
          }
        : {
            text: "Puedes ver el estado de todos tus pedidos (procesando, pagado, entregado…) en Mis pedidos.",
            quickReplies: [{ label: "📦 Ver mis pedidos", send: "__nav:/client/orders" }],
          },
  },
  {
    id: "precio-mayorista",
    keywords: [
      "mayorista",
      "al mayor",
      "por mayor",
      "detal",
      "descuento",
      "b2b",
      "precio mayorista",
    ],
    reply: () => ({
      text: "El catálogo siempre muestra el precio detal y el precio mayorista de referencia. Para acceder al mayorista (o pedir un descuento especial), envía una solicitud de cotización — nuestro equipo la revisa y te confirma.",
      quickReplies: [
        { label: "🧾 Solicitar cotización", send: "__nav:/quotes" },
        { label: "🔎 Ver catálogo", send: "__nav:/catalog" },
      ],
    }),
  },
  {
    id: "envios",
    keywords: [
      "envio",
      "despacho",
      "domicilio",
      "delivery",
      "despachan a",
      "envian al interior",
      "llega a",
      "cuanto demora",
      "cuanto tarda",
    ],
    reply: () => ({
      text: "Hacemos despacho a nivel nacional. Los tiempos y costos varían según destino y volumen — nuestro equipo te confirma el detalle exacto al armar tu pedido.",
    }),
  },
  {
    id: "garantia",
    keywords: [
      "garantia",
      "se daño",
      "llego malo",
      "llego dañado",
      "esta dañado",
      "no funciona",
      "no sirve",
      "defectuoso",
      "esta fallando",
    ],
    reply: () => ({
      text: "Todos los productos tienen garantía de marca. Si algo llega con falla, contáctanos con tu número de pedido y lo resolvemos con el fabricante o distribuidor.",
    }),
  },
  {
    id: "carrito",
    keywords: ["carrito"],
    reply: (ctx) =>
      ctx.cartCount > 0
        ? {
            text: `Tienes ${ctx.cartCount} artículo(s) en el carrito por ${ctx.formatMoney(ctx.cartTotal)}.`,
            quickReplies: [{ label: "🛒 Ir al carrito", send: "__nav:/cart" }],
          }
        : {
            text: "Tu carrito está vacío por ahora.",
            quickReplies: [{ label: "🔎 Ver catálogo", send: "__nav:/catalog" }],
          },
  },
  {
    id: "cuenta",
    keywords: ["iniciar sesion", "login", "registrar", "crear cuenta", "cuenta"],
    reply: () => ({
      text: "Puedes iniciar sesión con Google o correo, o crear una cuenta nueva en segundos.",
      quickReplies: [
        { label: "🔑 Iniciar sesión", send: "__nav:/login" },
        { label: "📝 Crear cuenta", send: "__nav:/register" },
      ],
    }),
  },
  {
    id: "contacto",
    keywords: [
      "contacto",
      "humano",
      "asesor",
      "telefono",
      "correo",
      "whatsapp",
      "horario",
      "hablar con alguien",
      "hablar con una persona",
      "atencion al cliente",
      "servicio al cliente",
      "me pueden llamar",
      "dame el numero",
      "dame tu numero",
      "pasame el numero",
      "me regalas el numero",
      "cual es el numero",
      "pueden dar el numero",
      "me dan el numero",
    ],
    reply: () => ({
      text: `Con gusto. Puedes escribirnos directamente:\nHorario: ${CONTACT_INFO.hours}.`,
      links: [
        { label: `💬 WhatsApp: ${CONTACT_INFO.phone}`, href: CONTACT_INFO.whatsappHref },
        { label: `✉️ ${CONTACT_INFO.email}`, href: CONTACT_INFO.emailHref },
      ],
    }),
  },
];

/** Reached only when nothing above matched AND the catalog search below
 * found nothing either — covers "tienen stock?", "cuanto cuesta?", "hay
 * disponible?" asked with no product named, which used to fall into the
 * generic "no entendí" reply even though the customer is clearly trying to
 * ask about a product, just didn't say which one yet. */
const LOOKING_FOR_SOMETHING_KEYWORDS = [
  "buscar producto",
  "ver catalogo",
  "ver productos",
  "que productos tienen",
  "que venden",
  "que tienen disponible",
  "tienen stock",
  "hay disponible",
  "hay disponibilidad",
  "disponibilidad",
  "disponible",
  "consiguen",
  "les queda",
  "hay existencia",
  "lo tienen",
  "tienen eso",
  "tienen en fisico",
  "cuanto cuesta",
  "cuanto vale",
  "cuanto sale",
  "cuanto esta",
  "a como esta",
  "a como",
  "que precio tiene",
  "costo de",
  "valor de",
];

function looksLikeProductQuestion(t: string, tokens: string[]): boolean {
  return matchScore(t, tokens, LOOKING_FOR_SOMETHING_KEYWORDS) > 0;
}

// ---- Catalog search --------------------------------------------------

/** Strips a trailing Spanish plural suffix ("bombillos" -> "bombillo",
 * "luces" -> "luce"-ish) so a plural search word still matches a catalog
 * entry written in the singular, and vice versa isn't needed since this
 * only loosens the token being searched for, not the haystack. */
function singularize(tok: string): string | null {
  if (tok.length > 5 && tok.endsWith("es")) return tok.slice(0, -2);
  if (tok.length > 4 && tok.endsWith("s")) return tok.slice(0, -1);
  return null;
}

/** Conversational filler with no product meaning: greetings, politeness
 * (including what slang expands to — "xfa" -> "por favor", "q" -> "que"),
 * and question/request words. Searched as-is they match inside unrelated
 * product text ("por" is a substring of "portalámparas"), polluting results. */
const SEARCH_STOPWORDS = new Set(
  (
    "que por favor para con del los las una uno unos unas esta estan ese esa eso " +
    "tiene tienen tengo hay como cual cuales cuanto cuanta cuesta vale sale precio precios " +
    "quiero necesito busco buscando algun alguno alguna dame dime pasa pasas regala regalas " +
    "ustedes tambien donde hola epa oye buenas buenos dias tardes noches saludos gracias " +
    "disponible disponibles existencia stock venden consiguen todo toda todos todas"
  ).split(" "),
);

/** The tokens worth searching the catalog for. */
function searchTerms(tokens: string[]): string[] {
  return tokens.filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
}

function searchProducts(
  searchTokens: string[],
  products: Product[],
  categoryLabel: Record<string, string>,
): Product[] {
  if (!searchTokens.length) return [];
  const scored = products
    .map((p) => {
      const haystack = normalize(
        `${p.name} ${p.sku} ${p.specs} ${categoryLabel[p.category] ?? ""}`,
      );
      const hits = searchTokens.filter((tok) => {
        if (haystack.includes(tok)) return true;
        const singular = singularize(tok);
        return singular ? haystack.includes(singular) : false;
      }).length;
      return { p, hits };
    })
    .filter((x) => x.hits > 0);
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 3).map((x) => x.p);
}

// ---- Entry point -----------------------------------------------------

export function buildReply(raw: string, ctx: ChatCtx): BotReplyContent[] {
  const { t, tokens } = preprocess(raw);
  if (!t) return [];

  const isGreeting = hasGreetingPrefix(t);

  let best: { reply: BotReplyContent; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = matchScore(t, tokens, intent.keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { reply: intent.reply(ctx), score };
    }
  }
  if (best) {
    return [isGreeting ? prependGreeting(best.reply) : best.reply];
  }

  const terms = searchTerms(tokens);
  const matches = searchProducts(terms, ctx.products, ctx.categoryLabel);
  if (matches.length > 0) {
    const query = terms.join(" ");
    const reply = {
      text: `Encontré esto en el catálogo para "${query}":`,
      products: matches,
      quickReplies: [{ label: "🔎 Ver todo en catálogo", send: `__navq:${query}` }],
    };
    return [isGreeting ? prependGreeting(reply) : reply];
  }

  if (isGreeting && tokens.length <= 4) {
    return [{ text: "¡Hola! ¿Qué necesitas hoy?", quickReplies: MAIN_MENU }];
  }

  if (looksLikeProductQuestion(t, tokens)) {
    const reply = {
      text: "Cuéntame qué producto buscas exactamente (ej. 'cable 12 AWG', 'breaker 20A' o 'bombillo LED') y te digo si está disponible y su precio.",
    };
    return [isGreeting ? prependGreeting(reply) : reply];
  }

  const reply = {
    text: "No estoy seguro de haber entendido 🤔 ¿Puedes elegir una opción o intentar con otras palabras?",
    quickReplies: MAIN_MENU,
  };
  return [isGreeting ? prependGreeting(reply) : reply];
}
