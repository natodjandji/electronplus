import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { formatMoney } from '../email/format-money';
import { SyncDirection } from '../erp-sync/entities/sync-log.entity';
import { StockAlertLevel } from '../inventory/entities/stock-alert.entity';
import { FulfillmentMethod } from '../orders/entities/order.entity';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { AdminAlertsService, stockSummary, type AdminAlert } from './admin-alerts.service';
import { MessagingSettingsService } from './messaging-settings.service';
import { ALERT_DETAIL_LIMIT } from './meta/alert-template';

const ADMIN = '584141610929';
// 12:00:30 → wait at least a minute → the window ending at 12:02.
const NOW = Date.parse('2026-10-21T12:00:30Z');

function setup(settings: Record<string, unknown> = { alertPhones: [ADMIN] }) {
  const firestore = new FakeFirestore();
  firestore.seed(Collections.SETTINGS, 'messaging', settings);
  const sent: { to: string; alert: AdminAlert }[] = [];
  const channels = {
    isConfigured: () => true,
    sendAlert: jest.fn(async (to: string, alert: AdminAlert) => {
      if (to.startsWith('1')) throw new Error('Meta messages respondió 400: not in allowed list');
      sent.push({ to, alert });
      return 'wamid.out';
    }),
  };
  const queue = { scheduleAlertFlush: jest.fn(async () => {}), setAlertFlushRunner: jest.fn() };
  const orders = {
    findById: async () => ({
      id: 'o1',
      totalAmount: 45.5,
      shippingFullName: 'Ana Pérez',
      paymentMethod: PaymentMethod.PAGO_MOVIL,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      shippingCity: 'Chacao',
      shippingState: 'Miranda',
      items: [{ qty: 2 }, { qty: 1 }],
    }),
  };
  const service = new AdminAlertsService(
    firestore as never,
    new MessagingSettingsService(firestore as never),
    channels as never,
    queue as never,
    orders as never,
  );
  return { firestore, service, sent, queue };
}

const stockAlert = (productId: string, name: string, level: StockAlertLevel, stock: number) => ({
  productId,
  sku: productId.toUpperCase(),
  name,
  level,
  stock,
});

describe('AdminAlertsService', () => {
  // Only the clock is faked: the Firestore fake runs on real promises and ticks.
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('sends a burst of stock alerts as one message, at the end of its window', async () => {
    const { service, sent, queue } = setup();
    await service.handleStockAlert(stockAlert('led9', 'Bombillo LED 9W', StockAlertLevel.OUT, 0));
    await service.handleStockAlert(stockAlert('brk20', 'Breaker 20A', StockAlertLevel.LOW, 3));
    await service.handleStockAlert(stockAlert('cab12', 'Cable THHN 12', StockAlertLevel.LOW, 4));
    // The same product again before the send: the newer state wins.
    await service.handleStockAlert(stockAlert('cab12', 'Cable THHN 12', StockAlertLevel.OUT, 0));

    expect(queue.scheduleAlertFlush).toHaveBeenCalledTimes(1);
    expect(queue.scheduleAlertFlush).toHaveBeenCalledWith(new Date('2026-10-21T12:02:00Z'));
    expect(sent).toEqual([]);

    expect(await service.flushStock()).toBe(3);
    expect(sent).toEqual([
      {
        to: ADMIN,
        alert: {
          title: '2 productos agotados y 1 con stock bajo',
          detail:
            'Bombillo LED 9W (LED9): agotado · Cable THHN 12 (CAB12): agotado · Breaker 20A (BRK20): quedan 3',
          panelPath: 'stock',
        },
      },
    ]);
    // Nothing left for the next window's send.
    expect(await service.flushStock()).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('words a lone stock alert like the panel’s bell', () => {
    expect(
      stockSummary([
        { sku: 'LED9', name: 'Bombillo LED 9W', level: StockAlertLevel.OUT, stock: 0 },
      ]),
    ).toEqual({
      title: 'Producto agotado',
      detail: 'Bombillo LED 9W (LED9): 0 unidades disponibles',
      panelPath: 'stock',
    });
  });

  it('lists as many products as fit and counts the rest', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      sku: `SKU-${i}`,
      name: `Producto con un nombre bastante largo número ${String(i).padStart(2, '0')}`,
      level: StockAlertLevel.LOW,
      stock: 1,
    }));
    const { title, detail } = stockSummary(many);
    expect(title).toBe('60 con stock bajo');
    expect(detail.length).toBeLessThanOrEqual(ALERT_DETAIL_LIMIT);
    const shown = detail.split(' · ').length - 1;
    expect(detail).toMatch(new RegExp(` · y ${60 - shown} más$`));
  });

  it('queues and sends nothing while no number is set', async () => {
    const { service, sent, queue, firestore } = setup({ alertPhones: [] });
    await service.handleStockAlert(stockAlert('led9', 'Bombillo LED 9W', StockAlertLevel.OUT, 0));
    await service.handleOrderCreated({ orderId: 'o1' });
    expect(queue.scheduleAlertFlush).not.toHaveBeenCalled();
    expect((await firestore.collection(Collections.ADMIN_ALERT_QUEUE).get()).docs).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  it('tells about a new order with who, how much, how it’s paid and where it goes', async () => {
    const { service, sent } = setup();
    await service.handleOrderCreated({ orderId: 'o1' });
    expect(sent[0].alert).toEqual({
      title: `Pedido nuevo · ${formatMoney(45.5)}`,
      detail: 'Ana Pérez · 3 productos · Pago móvil · Envío a Chacao, Miranda',
      panelPath: 'orders',
    });
  });

  it('flags a bad review and a chat waiting for a person', async () => {
    const { service, sent } = setup();
    await service.handleReviewCreated({
      rating: 1,
      sourceId: 'google',
      sourceLabel: 'Google',
      message: 'Me atendieron tarde',
      customerName: 'Luis',
      customerPhone: '0412-5550000',
      createdAt: new Date(),
    } as never);
    await service.handleChatHandoff({
      conversationId: 'whatsapp_584121112233',
      channel: 'whatsapp',
      customerName: 'María',
      reason: 'Quiere pagar en efectivo al retirar',
      summary: '',
    });
    expect(sent.map((s) => s.alert)).toEqual([
      {
        title: 'Reseña para atender: 1/5',
        detail: 'Luis (0412-5550000) · "Me atendieron tarde"',
        panelPath: 'reviews',
      },
      {
        title: 'Cliente esperando en WhatsApp',
        detail: 'María: Quiere pagar en efectivo al retirar',
        panelPath: 'conversations',
      },
    ]);
  });

  it('sends a repeating Profit Plus error once per cooldown, and a different one at once', async () => {
    const { service, sent } = setup();
    const error = { direction: SyncDirection.INBOUND, message: 'El bridge no respondió' };
    await service.handleErpSyncError(error);
    await service.handleErpSyncError(error);
    await service.handleErpSyncError({ ...error, message: 'Credenciales inválidas' });
    expect(sent.map((s) => s.alert.detail)).toEqual([
      'El bridge no respondió',
      'Credenciales inválidas',
    ]);
    expect(sent[0].alert.panelPath).toBe('settings?tab=erp-sync');

    jest.setSystemTime(NOW + 7 * 60 * 60 * 1000);
    await service.handleErpSyncError(error);
    expect(sent).toHaveLength(3);
  });

  it('keeps sending to the other numbers when one fails, and reports it', async () => {
    const { service, sent } = setup({ alertPhones: ['15551975075', ADMIN] });
    expect(await service.sendTest()).toEqual({
      sent: 1,
      failed: [{ phone: '15551975075', error: 'Meta messages respondió 400: not in allowed list' }],
    });
    expect(sent.map((s) => s.to)).toEqual([ADMIN]);
  });
});
