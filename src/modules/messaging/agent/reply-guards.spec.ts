import {
  clipReply,
  keepKnownLinks,
  linkHosts,
  MAX_REPLY_CHARS,
  truncateCustomerText,
} from './reply-guards';

const STORE = ['electronplus.com.ve'];

describe('keepKnownLinks', () => {
  it('keeps the store’s links, with or without scheme, www or a subdomain', () => {
    const text =
      'Véalo en https://electronplus.com.ve/product/led-9w, www.electronplus.com.ve o tienda.electronplus.com.ve.';
    expect(keepKnownLinks(text, STORE)).toEqual({ text, removed: [] });
  });

  it('removes any other link, written however, and tidies the gap', () => {
    const { text, removed } = keepKnownLinks(
      'Pague en https://pago-seguro.xyz/ve?ref=1 o en bit.ly/abc. También www.otra-tienda.com.ve, gracias.',
      STORE,
    );
    expect(text).toBe('Pague en o en. También, gracias.');
    expect(removed).toEqual([
      'https://pago-seguro.xyz/ve?ref=1',
      'bit.ly/abc',
      'www.otra-tienda.com.ve',
    ]);
  });

  it('leaves e-mail addresses and ordinary text alone', () => {
    const text = 'Zelle: ventas@gmail.com. Precio REF 12,50 por 2.5 m de cable 12 AWG.';
    expect(keepKnownLinks(text, STORE)).toEqual({ text, removed: [] });
  });

  it('does not take a lookalike for the store', () => {
    expect(keepKnownLinks('https://electronplus.com.ve.evil.co/x', STORE).removed).toHaveLength(1);
    expect(keepKnownLinks('https://notelectronplus.com.ve', STORE).removed).toHaveLength(1);
  });
});

describe('linkHosts', () => {
  it('finds the hosts in a tool’s JSON result', () => {
    expect(
      linkHosts(
        '{"datos":["https://paypal.me/electronplus","Binance Pay ID 123"],"web":"www.electronplus.com.ve/cart"}',
      ),
    ).toEqual(['paypal.me', 'electronplus.com.ve']);
  });
});

describe('clipReply', () => {
  it('leaves a normal reply as it is', () => {
    expect(clipReply('Sí, tenemos. ¿Cuántos necesita?')).toBe('Sí, tenemos. ¿Cuántos necesita?');
  });

  it('cuts a long one at the last sentence that fits', () => {
    const clipped = clipReply('Una frase completa. '.repeat(100));
    expect(clipped.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(clipped).toMatch(/completa\.$/);
  });

  it('cuts at a word, with an ellipsis, when there is no sentence to stop at', () => {
    const clipped = clipReply('palabra '.repeat(300));
    expect(clipped.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(clipped).toMatch(/palabra…$/);
  });
});

describe('truncateCustomerText', () => {
  it('marks where a long message was cut', () => {
    expect(truncateCustomerText('abcdef', 3)).toBe('abc […mensaje recortado]');
    expect(truncateCustomerText('abc', 3)).toBe('abc');
  });
});
