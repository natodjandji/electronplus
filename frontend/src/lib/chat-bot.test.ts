import { describe, expect, it } from "vitest";
import { buildReply, type ChatCtx } from "./chat-bot";
import { CONTACT_INFO } from "./contact-info";
import type { Product } from "./product";

const product = (id: string, name: string, stock = 10, category = "cables"): Product =>
  ({
    id,
    sku: id.toUpperCase(),
    name,
    category,
    retailPrice: 5,
    wholesalePrice: 4,
    stock,
    image: "",
    thumbnail: "",
    specs: "",
  }) as Product;

const ctx = (overrides: Partial<ChatCtx> = {}): ChatCtx => ({
  role: "guest",
  cartCount: 0,
  cartTotal: 0,
  products: [
    product("cable-12-awg", "Cable THHN 12 AWG"),
    product("bombillo-led-9w", "Bombillo LED 9W", 10, "iluminacion"),
    product("breaker-20a", "Breaker 20A", 10, "proteccion"),
    product("portalampara-e27", "Portalámparas E27 porcelana", 10, "iluminacion"),
  ],
  categoryLabel: { cables: "Cables", iluminacion: "Iluminación", proteccion: "Protección" },
  formatMoney: (n) => `REF ${n.toFixed(2)}`,
  cashea: { online: false, minAmount: null },
  paymentMethods: ["Pago Móvil", "Efectivo", "Binance", "PayPal"],
  ...overrides,
});

const reply = (message: string, c: ChatCtx = ctx()) => {
  const [first] = buildReply(message, c);
  return first;
};

describe("chat-bot buildReply — informal Venezuelan Spanish", () => {
  it("greets a bare greeting, including repeated letters", () => {
    expect(reply("holaaaa buenas")?.text).toContain("¡Hola!");
  });

  it("understands WhatsApp slang plus a product name", () => {
    const r = reply("q precio tiene el cable xfa");
    expect(r?.products?.map((p) => p.id)).toEqual(["cable-12-awg"]);
  });

  it('understands "a como esta" (price idiom) without the word "precio"', () => {
    expect(reply("a como esta el breaker")?.products?.[0]?.id).toBe("breaker-20a");
  });

  it("matches a plural search word against a singular catalog name", () => {
    expect(reply("tienen bombillos led?")?.products?.[0]?.id).toBe("bombillo-led-9w");
  });

  it('does not confuse "cuesta" with "cuenta" (login intent)', () => {
    const r = reply("cuanto cuesta un bombillo led");
    expect(r?.products?.[0]?.id).toBe("bombillo-led-9w");
    expect(r?.text).not.toContain("iniciar sesión");
  });

  it("tolerates a typo on a long keyword", () => {
    expect(reply("grasias, eso seria todo")?.text).toContain("Con gusto");
  });

  it("asks which product when the question has no product in it", () => {
    expect(reply("cuanto vale todo")?.text).toContain("Cuéntame qué producto buscas");
  });

  it("keeps the greeting on every reply path", () => {
    expect(reply("epa buenas, tienen disponible algun bombillo?")?.text).toMatch(/^¡Hola!/);
    expect(reply("epa buenas, tienen disponible alguna antena parabolica?")?.text).toMatch(
      /^¡Hola!/,
    );
    expect(reply("hola asdkjalksjd qwerty zxcvb")?.text).toMatch(/^¡Hola!/);
  });

  it("does not let filler words from slang expansion match product text", () => {
    // "xfa" -> "por favor" and "q" -> "que": "por" is a substring of
    // "Portalámparas ... porcelana", so it must not pull that product in.
    const ids = reply("q bombillo tienen xfa")?.products?.map((p) => p.id);
    expect(ids).toEqual(["bombillo-led-9w"]);
  });

  it("falls back to the menu on gibberish", () => {
    const r = reply("asdkjalksjd");
    expect(r?.text).toContain("No estoy seguro");
    expect(r?.quickReplies?.length).toBeGreaterThan(0);
  });
});

describe("chat-bot buildReply — contact is WhatsApp-only", () => {
  it("offers WhatsApp and email links, and no phone-call link", () => {
    const r = reply("me pasas el whatsapp porfa");
    const hrefs = r?.links?.map((l) => l.href) ?? [];
    expect(hrefs).toContain(CONTACT_INFO.whatsappHref);
    expect(hrefs).toContain(CONTACT_INFO.emailHref);
    expect(hrefs.some((h) => h.startsWith("tel:"))).toBe(false);
  });

  it("answers casual requests for the phone number with the same contact reply", () => {
    expect(reply("me regalas el numero")?.links?.length).toBeGreaterThan(0);
  });
});

describe("chat-bot buildReply — session-aware intents", () => {
  it("sends guests to log in to see their orders, clients to their orders page", () => {
    expect(reply("donde esta mi pedido")?.quickReplies?.[0]?.send).toBe("__nav:/login");
    expect(reply("donde esta mi pedido", ctx({ role: "client" }))?.quickReplies?.[0]?.send).toBe(
      "__nav:/client/orders",
    );
  });

  it("reports the cart contents using the injected money formatter", () => {
    const r = reply("que tengo en el carrito", ctx({ cartCount: 2, cartTotal: 12.5 }));
    expect(r?.text).toContain("2 artículo(s)");
    expect(r?.text).toContain("REF 12.50");
  });

  it("ignores empty input", () => {
    expect(buildReply("   ", ctx())).toEqual([]);
  });
});

describe("chat-bot buildReply — Cashea", () => {
  it("says Cashea is taken at the store while it isn't on the web", () => {
    const r = reply("aceptan cashea?");
    expect(r.text).toContain("Aceptamos Cashea en nuestra tienda");
    expect(r.text).toContain("no está disponible para compras en la web");
    expect(r.links?.map((l) => l.href)).toEqual([CONTACT_INFO.mapsHref, CONTACT_INFO.whatsappHref]);
  });

  it("answers the same before the status loads, like the catalog's banner", () => {
    expect(reply("se puede pagar con cashea", ctx({ cashea: null })).text).toContain(
      "en nuestra tienda",
    );
  });

  it("points to checkout, with the minimum, once Cashea is on the web", () => {
    const r = reply("Hola, trabajan con Cashea?", ctx({ cashea: { online: true, minAmount: 20 } }));
    expect(r.text).toContain("pagar con Cashea en la web");
    expect(r.text).toContain("compra mínima de REF 20.00");
    expect(r.quickReplies?.[0].send).toBe("__nav:/cart");
  });

  it("understands it misspelled or asked as paying in installments", () => {
    for (const message of ["tienen cachea", "puedo pagar en cuotas?", "hay financiamiento"]) {
      expect(reply(message).text).toContain("Cashea");
    }
  });
});

describe("chat-bot buildReply — payment methods", () => {
  it("lists the active methods, the BCV rate and Cashea at the store", () => {
    const r = reply("que metodos de pago tienen?");
    expect(r.text).toContain("Puedes pagar con Pago Móvil, Efectivo, Binance y PayPal.");
    expect(r.text).toContain("tasa oficial del BCV");
    expect(r.text).toContain("En nuestra tienda también aceptamos Cashea");
  });

  it("confirms a method asked by name, and lists the rest", () => {
    expect(reply("aceptan pago movil?").text).toContain(
      "¡Sí! Aceptamos Pago Móvil. También puedes pagar con Efectivo, Binance y PayPal.",
    );
  });

  it("says plainly when a method isn't taken", () => {
    expect(reply("se puede pagar con zelle?").text).toContain(
      "Por ahora no aceptamos Zelle. Puedes pagar con Pago Móvil, Efectivo, Binance y PayPal.",
    );
  });

  it("sends to checkout and WhatsApp when the list isn't known", () => {
    const r = reply("formas de pago", ctx({ paymentMethods: null }));
    expect(r.text).toContain("Al pagar tu pedido ves todos los métodos disponibles");
    expect(r.links?.[0].href).toBe(CONTACT_INFO.whatsappHref);
  });

  it("still answers Cashea questions with Cashea", () => {
    expect(reply("se puede pagar con cashea").text).toContain("Aceptamos Cashea en nuestra tienda");
  });
});
