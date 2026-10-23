import { htmlToText } from './html-to-text';
import { orderCreatedEmail } from './templates/order-created-email';
import { reviewCreatedEmail } from './templates/review-created-email';

describe('htmlToText', () => {
  it('leaves out the head, comments and anything marked data-skip-text', () => {
    const html = `<html><head><style>.px{}</style></head><body>
      <!-- header -->
      <div data-skip-text style="display:none">Vista previa</div>
      <p>Hola</p></body></html>`;
    expect(htmlToText(html)).toBe('Hola');
  });

  it('keeps each link URL next to its label, decoding it once', () => {
    const html = `<p><a href="https://x.ve/pago?quoteId=1&amp;b=2" style="x">Continuar al pago</a></p>
      <p><a href="mailto:hola@x.ve">hola@x.ve</a> · <a href="https://x.ve">https://x.ve</a></p>`;
    expect(htmlToText(html)).toBe(
      'Continuar al pago (https://x.ve/pago?quoteId=1&b=2)\n\nhola@x.ve · https://x.ve',
    );
  });

  it('reads label/value cells as "label: value" and stacked cells as lines', () => {
    const html = `
      <table><tr><td><div>Cable 12</div><div>CB-12 · Cantidad: 2</div></td><td>REF 90,00</td></tr></table>
      <table><tr><td>Subtotal</td><td>REF 90,00</td></tr><tr><td>Total</td><td>REF 93,96</td></tr></table>`;
    expect(htmlToText(html)).toBe(
      'Cable 12\nCB-12 · Cantidad: 2\nREF 90,00\n\nSubtotal: REF 90,00\nTotal: REF 93,96',
    );
  });

  it('turns images into their alt text and escaped text back into what was typed', () => {
    const html = `<table><tr><td><img src="cid:logo" alt="Electron Plus" /></td></tr></table><p>&lt;b&gt;hola&lt;/b&gt; &amp;lt; &quot;ok&quot;&nbsp;&#39;sí&#39;</p>`;
    expect(htmlToText(html)).toBe(`Electron Plus\n\n<b>hola</b> &lt; "ok" 'sí'`);
  });

  it('renders a whole order email as readable text', () => {
    const order = {
      items: [{ name: 'Cable 12', sku: 'CB-12', qty: 2, lineTotal: 90 }],
      subtotal: 90,
      discountAmount: 0,
      taxAmount: 14.4,
      shippingCost: 0,
      totalAmount: 104.4,
    } as never;
    const text = htmlToText(orderCreatedEmail(order, 'https://electronplus.com.ve').html);
    expect(text).toMatch(
      /^Electron Plus\n\nPedido recibido\n¡Gracias por tu compra!\n\nProcesando pago\n\nRecibimos tu pedido/,
    );
    expect(text).toContain('Cable 12\nCB-12 · Cantidad: 2\nREF 90,00');
    expect(text).toMatch(/Envío: Gratis\nTotal: REF 104,40/);
    expect(text).toContain('Ver mis pedidos (https://electronplus.com.ve/client/orders)');
    expect(text).toMatch(
      /WhatsApp al \+58 424-555\.5990 \(https:\/\/wa\.me\/584245555990\) o responde/,
    );
  });

  it('shows a review rating as its filled stars only', () => {
    const { html } = reviewCreatedEmail(
      { rating: 2, sourceLabel: 'Instagram', createdAt: new Date('2026-10-18T17:30:00Z') },
      'https://electronplus.com.ve',
    );
    expect(htmlToText(html)).toContain('\n★★ Mala\n');
  });
});
