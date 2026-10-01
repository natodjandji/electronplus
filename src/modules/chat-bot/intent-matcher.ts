import { formatMoney } from './format-money';

/**
 * Rule-based (no LLM — same reasoning as the website widget: free to run,
 * predictable) intent matcher for the WhatsApp bot. The matching algorithm
 * (normalize, collapse repeated letters, expand WhatsApp slang, strip edge
 * punctuation, typo-tolerant scoring) is a direct port of
 * frontend/src/lib/chat-bot.ts — same principles, same tuning for informal
 * Venezuelan Spanish. The INTENTS table differs because the channel does:
 * no cart/login session, no quick-reply buttons (plain text + links), and
 * unlike the website's inert "aquí tienes el teléfono", "contacto" and the
 * final fallback here actually escalate to a human via ChatbotEscalationEvent
 * since a WhatsApp thread is a live two-way conversation.
 */

export type ProductSummary = {
  name: string;
  retailPrice: number;
  stock: number;
  thumbnailUrl?: string;
};

export type ChatBotDeps = {
  searchProducts: (query: string) => Promise<ProductSummary[]>;
  siteUrl: string;
};

export type BotReply = {
  text: string;
  imageUrl?: string;
  escalate?: boolean;
};

// ---- Text normalization (ported from frontend/src/lib/chat-bot.ts) -------

function stripAccents(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function collapseRepeats(text: string) {
  return text.replace(/(.)\1{2,}/g, '$1');
}

const SLANG: Record<string, string> = {
  q: 'que',
  k: 'que',
  x: 'por',
  xq: 'porque',
  pq: 'porque',
  tb: 'tambien',
  tmb: 'tambien',
  tmbn: 'tambien',
  dnd: 'donde',
  tlf: 'telefono',
  tlfno: 'telefono',
  bn: 'bien',
  porfa: 'por favor',
  porfis: 'por favor',
  xfa: 'por favor',
  uds: 'ustedes',
  ola: 'hola',
};

function expandSlang(tokens: string[]): string[] {
  return tokens.map((tok) => SLANG[tok] ?? tok).flatMap((tok) => tok.split(' '));
}

function normalize(text: string) {
  return stripAccents(text).toLowerCase().trim();
}

function stripEdgePunct(tok: string): string {
  return tok.replace(/^[¿¡"'(]+|[?!."',;:)]+$/g, '');
}

function preprocess(raw: string): { t: string; tokens: string[] } {
  const base = collapseRepeats(normalize(raw));
  const rawTokens = base.split(/\s+/).map(stripEdgePunct).filter(Boolean);
  const tokens = expandSlang(rawTokens);
  return { t: tokens.join(' '), tokens };
}

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

function matchScore(t: string, tokens: string[], keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (t.includes(kw)) score++;
      continue;
    }
    if (t.includes(kw)) {
      score++;
      continue;
    }
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

const GREETING_RE =
  /^(hola|epa|ep|oye|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|saludos|alo)\b/;

function hasGreetingPrefix(t: string): boolean {
  return GREETING_RE.test(t);
}

function prependGreeting(reply: BotReply): BotReply {
  return { ...reply, text: `¡Hola! ${reply.text}` };
}

function singularize(tok: string): string | null {
  if (tok.length > 5 && tok.endsWith('es')) return tok.slice(0, -2);
  if (tok.length > 4 && tok.endsWith('s')) return tok.slice(0, -1);
  return null;
}

// ---- Intent table ----------------------------------------------------

type Intent = {
  keywords: string[];
  reply: (deps: ChatBotDeps) => BotReply;
};

const INTENTS: Intent[] = [
  {
    keywords: [
      'gracias',
      'te agradezco',
      'eso es todo',
      'eso seria todo',
      'nada mas por ahora',
      'nada mas',
      'chao',
      'hasta luego',
      'nos vemos',
    ],
    reply: () => ({ text: '¡Con gusto! Si necesitas algo más, aquí estoy. 😊' }),
  },
  {
    keywords: ['menu', 'ayuda', 'opciones', 'que puedes hacer', 'en que me ayudas', 'que ofreces'],
    reply: () => ({
      text:
        'Puedo ayudarte con:\n' +
        '🔎 Buscar productos y precios\n' +
        '🧾 Cotizaciones\n' +
        '💲 Precios detal/mayorista\n' +
        '🚚 Envíos y garantía\n' +
        '☎️ Hablar con un asesor\n\n' +
        'Cuéntame qué necesitas.',
    }),
  },
  {
    keywords: ['cotiz', 'presupuesto', 'precio especial', 'descuento por cantidad'],
    reply: (deps) => ({
      text:
        'Para armar tu cotización entra a nuestra página, eliges productos y cantidades, y la envías — te confirmamos si se aprueba o si aplica un descuento especial:\n' +
        `👉 ${deps.siteUrl}/quotes`,
    }),
  },
  {
    keywords: [
      'pedido',
      'orden',
      'seguimiento',
      'mi compra',
      'donde esta mi pedido',
      'cuando llega mi pedido',
      'ya me llego',
      'rastrear',
      'tracking',
      'estatus de mi pedido',
    ],
    reply: (deps) => ({
      text: `Para ver el estado de tu pedido, inicia sesión en nuestra página: 👉 ${deps.siteUrl}/login`,
    }),
  },
  {
    keywords: [
      'mayorista',
      'al mayor',
      'por mayor',
      'detal',
      'descuento',
      'b2b',
      'precio mayorista',
    ],
    reply: (deps) => ({
      text:
        'Mostramos precio detal y mayorista de referencia en el catálogo. Para acceder al mayorista (o pedir un descuento especial), envía una solicitud de cotización:\n' +
        `👉 ${deps.siteUrl}/quotes`,
    }),
  },
  {
    keywords: [
      'envio',
      'despacho',
      'domicilio',
      'delivery',
      'despachan a',
      'envian al interior',
      'llega a',
      'cuanto demora',
      'cuanto tarda',
    ],
    reply: () => ({
      text: 'Hacemos despacho a nivel nacional. Los tiempos y costos varían según destino y volumen — te confirmamos el detalle exacto al armar tu pedido.',
    }),
  },
  {
    keywords: [
      'garantia',
      'se daño',
      'llego malo',
      'llego dañado',
      'esta dañado',
      'no funciona',
      'no sirve',
      'defectuoso',
      'esta fallando',
    ],
    reply: () => ({
      text: 'Todos los productos tienen garantía de marca. Si algo llega con falla, cuéntanos tu número de pedido y lo resolvemos con el fabricante o distribuidor.',
    }),
  },
  {
    keywords: ['iniciar sesion', 'login', 'registrar', 'crear cuenta', 'cuenta'],
    reply: (deps) => ({
      text: `Puedes crear tu cuenta o iniciar sesión en nuestra página: 👉 ${deps.siteUrl}/login`,
    }),
  },
  {
    keywords: [
      'contacto',
      'humano',
      'asesor',
      'telefono',
      'correo',
      'horario',
      'hablar con alguien',
      'hablar con una persona',
      'atencion al cliente',
      'servicio al cliente',
      'me pueden llamar',
      'dame el numero',
      'dame tu numero',
      'pasame el numero',
      'me regalas el numero',
      'cual es el numero',
      'pueden dar el numero',
      'me dan el numero',
    ],
    reply: () => ({
      text: 'Ya estás hablando con nosotros por aquí — en breve te atiende alguien del equipo. Horario: Lun–Sáb 9am–5pm.',
      escalate: true,
    }),
  },
];

const LOOKING_FOR_SOMETHING_KEYWORDS = [
  'buscar producto',
  'ver catalogo',
  'ver productos',
  'que productos tienen',
  'que venden',
  'que tienen disponible',
  'tienen stock',
  'hay disponible',
  'hay disponibilidad',
  'disponibilidad',
  'disponible',
  'consiguen',
  'les queda',
  'hay existencia',
  'lo tienen',
  'tienen eso',
  'tienen en fisico',
  'cuanto cuesta',
  'cuanto vale',
  'cuanto sale',
  'cuanto esta',
  'a como esta',
  'a como',
  'que precio tiene',
  'costo de',
  'valor de',
];

function looksLikeProductQuestion(t: string, tokens: string[]): boolean {
  return matchScore(t, tokens, LOOKING_FOR_SOMETHING_KEYWORDS) > 0;
}

function productSearchTokens(tokens: string[]): string[] {
  return tokens.filter((w) => w.length >= 3);
}

// ---- Entry point -----------------------------------------------------

export async function buildReply(raw: string, deps: ChatBotDeps): Promise<BotReply> {
  const { t, tokens } = preprocess(raw);
  if (!t) return { text: 'No logré leer tu mensaje 🤔 ¿Puedes intentar de nuevo?' };

  const isGreeting = hasGreetingPrefix(t);

  let best: { reply: BotReply; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = matchScore(t, tokens, intent.keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { reply: intent.reply(deps), score };
    }
  }
  if (best) {
    return isGreeting ? prependGreeting(best.reply) : best.reply;
  }

  const searchTokens = productSearchTokens(tokens);
  if (searchTokens.length > 0) {
    const matches = await deps.searchProducts(searchTokens.join(' '));
    if (matches.length > 0) {
      const lines = matches
        .map((p) => `• ${p.name} — ${formatMoney(p.retailPrice)}${p.stock > 0 ? '' : ' (agotado)'}`)
        .join('\n');
      return {
        text: `Encontré esto en el catálogo:\n${lines}\n\nVer todo: 👉 ${deps.siteUrl}/catalog`,
        imageUrl: matches[0]?.thumbnailUrl,
      };
    }
    // Plurals/typos may still have found nothing real — try the singular
    // form of each token once before giving up, same heuristic as the
    // website widget's searchProducts().
    const singular = searchTokens.map((tok) => singularize(tok)).filter((s): s is string => !!s);
    if (singular.length > 0) {
      const retry = await deps.searchProducts(singular.join(' '));
      if (retry.length > 0) {
        const lines = retry
          .map(
            (p) => `• ${p.name} — ${formatMoney(p.retailPrice)}${p.stock > 0 ? '' : ' (agotado)'}`,
          )
          .join('\n');
        return {
          text: `Encontré esto en el catálogo:\n${lines}\n\nVer todo: 👉 ${deps.siteUrl}/catalog`,
          imageUrl: retry[0]?.thumbnailUrl,
        };
      }
    }
  }

  if (isGreeting && tokens.length <= 4) {
    return {
      text: '¡Hola! ¿Qué necesitas hoy? Puedo ayudarte a buscar productos, cotizar o resolver dudas.',
    };
  }

  if (looksLikeProductQuestion(t, tokens)) {
    return {
      text: "Cuéntame qué producto buscas exactamente (ej. 'cable 12 AWG', 'breaker 20A' o 'bombillo LED') y te digo si está disponible y su precio.",
    };
  }

  return {
    text: 'No logré entender tu mensaje 🤔 ¿Puedes contarme con otras palabras? En breve te atiende alguien del equipo también.',
    escalate: true,
  };
}
