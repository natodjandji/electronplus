import { buildReply, ProductSummary } from './intent-matcher';

/** Same battery of realistic informal Venezuelan-Spanish messages used to
 * validate the website widget's identical matching algorithm (see
 * frontend/src/lib/chat-bot.ts) — this is the ported, WhatsApp-adapted
 * version, so the same inputs should still resolve sensibly. */
describe('chat-bot intent-matcher', () => {
  const CATALOG: ProductSummary[] = [
    { name: 'Cable THHN 12 AWG', retailPrice: 45, stock: 20, thumbnailUrl: 'https://x/cable.jpg' },
    { name: 'Bombillo LED 9W', retailPrice: 3.2, stock: 42, thumbnailUrl: 'https://x/bombillo.jpg' },
    { name: 'Breaker 20A', retailPrice: 8.5, stock: 0 },
  ];

  function searchProducts(query: string): Promise<ProductSummary[]> {
    const tokens = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    const matches = CATALOG.filter((p) =>
      tokens.some((tok) => p.name.toLowerCase().includes(tok)),
    );
    return Promise.resolve(matches.slice(0, 3));
  }

  const deps = { searchProducts, siteUrl: 'https://electronplus-ve.web.app' };

  async function reply(message: string) {
    return buildReply(message, deps);
  }

  it('greets on a bare "hola" without needing an exact-match anchor', async () => {
    const r = await reply('holaaaa buenas');
    expect(r.text).toContain('¡Hola!');
  });

  it('understands "cuanto cuesta" without the literal word "precio"', async () => {
    const r = await reply('cuanto cuesta un bombillo led');
    expect(r.text).toContain('Bombillo LED 9W');
  });

  it('understands the Venezuelan idiom "a como esta"', async () => {
    const r = await reply('a como esta el breaker');
    expect(r.text).toContain('Breaker 20A');
    expect(r.text).toContain('agotado');
  });

  it('tolerates a plural search token against a singular catalog entry', async () => {
    const r = await reply('tienen stock de bombillos?');
    expect(r.text).toContain('Bombillo LED 9W');
  });

  it('tolerates a one-letter typo on a long keyword ("cotisar")', async () => {
    const r = await reply('quiero cotisar unos cables');
    // "cotiz" keyword scores via fuzzy match OR the message also contains a
    // real product token ("cables") — either way this must not fall through
    // to the generic "no entendí" fallback.
    expect(r.text).not.toContain('No logré entender');
  });

  it('does not confuse "cuesta" with "cuenta" (short-word fuzzy-match guard)', async () => {
    const r = await reply('cuanto cuesta un bombillo led');
    expect(r.text).not.toContain('iniciar sesión');
  });

  it('recognizes a farewell and does not escalate', async () => {
    const r = await reply('muchas graciaaas, eso es todo');
    expect(r.text).toContain('Con gusto');
    expect(r.escalate).toBeFalsy();
  });

  it('escalates to a human on explicit contact request', async () => {
    const r = await reply('quiero hablar con un asesor');
    expect(r.escalate).toBe(true);
  });

  it('escalates on a fully unrecognized message', async () => {
    const r = await reply('asdkjalksjd');
    expect(r.escalate).toBe(true);
  });

  it('nudges for a product name instead of giving up on a bare availability question', async () => {
    const r = await reply('cuanto vale todo');
    expect(r.text).toContain('Cuéntame qué producto buscas');
    expect(r.escalate).toBeFalsy();
  });

  it('points to the real site URL for cotizaciones', async () => {
    const r = await reply('necesito un presupuesto para 50 bombillos');
    expect(r.text).toContain('https://electronplus-ve.web.app/quotes');
  });
});
