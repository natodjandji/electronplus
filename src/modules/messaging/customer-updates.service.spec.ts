import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { formatMoney } from '../email/format-money';
import { OrderStatus } from '../orders/entities/order.entity';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { ChatStoreService } from './chat-store.service';
import { CustomerUpdatesService, whatsappNumber } from './customer-updates.service';
import { MessagingSettingsService } from './messaging-settings.service';

const CUSTOMER = '584121112233';
const CHAT = `whatsapp_${CUSTOMER}`;
// Template parameters are one plain line: the price's non-breaking space too.
const TOTAL = formatMoney(45.5).replace(/\s/g, ' ');

function setup(
  options: {
    settings?: Record<string, unknown>;
    order?: Record<string, unknown>;
    user?: Record<string, unknown>;
  } = {},
) {
  const firestore = new FakeFirestore();
  firestore.seed(
    Collections.SETTINGS,
    'messaging',
    options.settings ?? { customerUpdatesEnabled: true },
  );
  const store = new ChatStoreService(firestore as never);
  const sent: { to: string; name: string; body: string[]; button?: string }[] = [];
  const channels = {
    isConfigured: () => true,
    sendTemplate: jest.fn(
      async (to: string, name: string, params: { body: string[]; button?: string }) => {
        sent.push({ to, name, ...params });
        return `wamid.${sent.length}`;
      },
    ),
  };
  const order = {
    id: 'a1b2c3d4e5f6',
    shippingFullName: 'Ana María Pérez',
    shippingPhone: '0412-1112233',
    totalAmount: 45.5,
    whatsappUpdates: true,
    ...options.order,
  };
  const service = new CustomerUpdatesService(
    new MessagingSettingsService(firestore as never),
    channels as never,
    store,
    { findById: async () => order } as never,
    {
      findById: async () => ({ id: 'q9z8y7x6w5', userId: 'u1', customerName: 'Luis Gómez' }),
    } as never,
    {
      findById: async () => ({ phone: '0412-1112233', whatsappUpdates: true, ...options.user }),
    } as never,
  );
  const chatMessages = async () =>
    (
      await firestore.collection(`${Collections.CHAT_CONVERSATIONS}/${CHAT}/messages`).get()
    ).docs.map((d) => d.data() as { author: string; text: string });
  return { firestore, service, sent, store, chatMessages };
}

describe('CustomerUpdatesService', () => {
  it('confirms a new order on WhatsApp and keeps it in the customer’s chat', async () => {
    const { service, sent, chatMessages, firestore } = setup();
    await service.handleOrderCreated({ orderId: 'a1b2c3d4e5f6' });

    expect(sent).toEqual([
      {
        to: CUSTOMER,
        name: 'pedido_recibido',
        body: ['Ana', '#A1B2C3D4', TOTAL],
        button: undefined,
      },
    ]);
    expect(await chatMessages()).toEqual([
      expect.objectContaining({
        author: 'bot',
        text: `Hola Ana, recibimos tu pedido #A1B2C3D4 por ${TOTAL} en Electron Plus. Te avisaremos por aquí cada vez que avance.`,
      }),
    ]);
    expect(firestore.read(Collections.CHAT_CONVERSATIONS, CHAT)).toEqual(
      expect.objectContaining({
        channel: 'whatsapp',
        customerId: CUSTOMER,
        customerName: 'Ana María Pérez',
      }),
    );
  });

  it('sends the status moments the emails cover, but not "en preparación"', async () => {
    const { service, sent } = setup();
    for (const status of [
      OrderStatus.PAID,
      OrderStatus.PREPARING,
      OrderStatus.SHIPPED,
      OrderStatus.FULFILLED,
    ]) {
      await service.handleOrderStatusChanged({ orderId: 'a1b2c3d4e5f6', status });
    }
    expect(sent.map((s) => s.name)).toEqual([
      'pago_confirmado',
      'pedido_enviado',
      'pedido_entregado',
    ]);
  });

  it('sends nothing until an admin turns it on', async () => {
    const { service, sent } = setup({ settings: {} });
    await service.handleOrderCreated({ orderId: 'a1b2c3d4e5f6' });
    expect(sent).toEqual([]);
  });

  it('sends nothing to who unchecked the box or left a landline', async () => {
    const unchecked = setup({ order: { whatsappUpdates: false } });
    await unchecked.service.handleOrderCreated({ orderId: 'a1b2c3d4e5f6' });
    const landline = setup({ order: { shippingPhone: '0212-5551234' } });
    await landline.service.handleOrderCreated({ orderId: 'a1b2c3d4e5f6' });
    expect([...unchecked.sent, ...landline.sent]).toEqual([]);
  });

  it('stops once an admin turns the chat’s updates off', async () => {
    const { service, sent, store } = setup();
    await service.handleOrderCreated({ orderId: 'a1b2c3d4e5f6' });
    await store.setNoticesOff(CHAT, true);
    await service.handleOrderStatusChanged({
      orderId: 'a1b2c3d4e5f6',
      status: OrderStatus.CANCELLED,
    });
    expect(sent.map((s) => s.name)).toEqual(['pedido_recibido']);
  });

  it('sends quote decisions to the profile’s phone, with the checkout link when approved', async () => {
    const { service, sent } = setup();
    await service.handleQuoteStatusChanged({ quoteId: 'q9z8y7x6w5', status: QuoteStatus.APPROVED });
    await service.handleQuoteStatusChanged({ quoteId: 'q9z8y7x6w5', status: QuoteStatus.REJECTED });
    expect(sent).toEqual([
      {
        to: CUSTOMER,
        name: 'cotizacion_aprobada',
        body: ['Luis', '#Q9Z8Y7X6'],
        button: 'q9z8y7x6w5',
      },
      {
        to: CUSTOMER,
        name: 'cotizacion_rechazada',
        body: ['Luis', '#Q9Z8Y7X6'],
        button: undefined,
      },
    ]);
  });

  it('skips quotes for customers who never agreed at a checkout', async () => {
    const { service, sent } = setup({ user: { whatsappUpdates: undefined } });
    await service.handleQuoteStatusChanged({ quoteId: 'q9z8y7x6w5', status: QuoteStatus.APPROVED });
    expect(sent).toEqual([]);
  });
});

describe('whatsappNumber', () => {
  it('turns a Venezuelan mobile into its WhatsApp address', () => {
    expect(whatsappNumber('0414-1234567')).toBe('584141234567');
    expect(whatsappNumber('+58 424 123 4567')).toBe('584241234567');
  });

  it('gives nothing for landlines, short numbers or none', () => {
    expect(whatsappNumber('0212-5551234')).toBeNull();
    expect(whatsappNumber('0414-12345')).toBeNull();
    expect(whatsappNumber(undefined)).toBeNull();
  });
});
