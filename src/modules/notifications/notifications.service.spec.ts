import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { SyncDirection } from '../erp-sync/entities/sync-log.entity';
import type { ErpSyncErrorEvent } from '../erp-sync/sync.service';
import type { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

// 10:00 a.m. in Caracas (UTC−4).
const NOW = Date.parse('2026-10-28T14:00:00Z');
const MINUTE = 60_000;

const bridgeDown: ErpSyncErrorEvent = {
  direction: SyncDirection.INBOUND,
  kind: 'inbound',
  message: 'El bridge de Profit Plus respondió 530',
};
const exportFailed = (orderId: string): ErpSyncErrorEvent => ({
  direction: SyncDirection.OUTBOUND,
  kind: 'export',
  message: 'El bridge de Profit Plus respondió 530',
  reference: orderId,
});

function setup() {
  const firestore = new FakeFirestore();
  const broadcasts: { event: string; payload: unknown }[] = [];
  const gateway = {
    broadcastToRoles: jest.fn((_roles: unknown, event: string, payload: unknown) =>
      broadcasts.push({ event, payload }),
    ),
  };
  const service = new NotificationsService(firestore as never, gateway as never);
  const byId = async (): Promise<Record<string, Omit<Notification, 'id'>>> =>
    Object.fromEntries(
      (await firestore.collection(Collections.NOTIFICATIONS).get()).docs.map((d) => [
        d.id,
        d.data() as unknown as Omit<Notification, 'id'>,
      ]),
    );
  return { firestore, service, broadcasts, byId };
}

describe('NotificationsService sync errors', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps a day of bridge errors in one notification that counts them', async () => {
    const { service, byId, broadcasts } = setup();
    await service.handleErpSyncError(bridgeDown);
    jest.setSystemTime(NOW + 15 * MINUTE);
    await service.handleErpSyncError(bridgeDown);
    jest.setSystemTime(NOW + 30 * MINUTE);
    await service.handleErpSyncError(bridgeDown);

    const all = await byId();
    expect(Object.keys(all)).toEqual(['sync-error-inbound-2026-10-28']);
    expect(all['sync-error-inbound-2026-10-28']).toEqual(
      expect.objectContaining({
        type: 'sync_error',
        title: 'Error de sincronización con Profit Plus',
        message: expect.stringMatching(
          /^El bridge de Profit Plus respondió 530 · 3 veces hoy, la última a las 10:30\s?a\.\s?m\.$/,
        ),
        occurrences: 3,
        read: false,
        createdAt: new Date(NOW),
        lastOccurredAt: new Date(NOW + 30 * MINUTE),
      }),
    );
    expect(broadcasts.map((b) => b.event)).toEqual([
      'notification.created',
      'notification.updated',
      'notification.updated',
    ]);
  });

  it('leaves the day’s notification read once read, and opens a new one the next day', async () => {
    const { service, firestore, byId } = setup();
    await service.handleErpSyncError(bridgeDown);
    await firestore
      .collection(Collections.NOTIFICATIONS)
      .doc('sync-error-inbound-2026-10-28')
      .set({ read: true }, { merge: true });
    await service.handleErpSyncError(bridgeDown);
    // 9 p.m. in Caracas is the next UTC day but the same store day.
    jest.setSystemTime(Date.parse('2026-10-29T01:00:00Z'));
    await service.handleErpSyncError(bridgeDown);
    jest.setSystemTime(Date.parse('2026-10-29T13:00:00Z'));
    await service.handleErpSyncError(bridgeDown);

    const all = await byId();
    expect(all['sync-error-inbound-2026-10-28']).toEqual(
      expect.objectContaining({ read: true, occurrences: 3 }),
    );
    expect(all['sync-error-inbound-2026-10-29']).toEqual(
      expect.objectContaining({ read: false, occurrences: 1, message: bridgeDown.message }),
    );
  });

  it('clears the inventory errors seen before a run that worked, older ones included', async () => {
    const { service, firestore, byId, broadcasts } = setup();
    // From before grouping: one notification per failed run.
    firestore.seed(Collections.NOTIFICATIONS, 'old-1', {
      type: 'sync_error',
      payload: { direction: 'inbound', message: 'x' },
      createdAt: new Date(NOW - 2 * 24 * 60 * MINUTE),
    });
    firestore.seed(Collections.NOTIFICATIONS, 'stock', {
      type: 'low_stock',
      createdAt: new Date(NOW - MINUTE),
    });
    await service.handleErpSyncError(bridgeDown);
    await service.handleErpSyncError(exportFailed('order-1'));
    // The run that works raises a removal warning of its own.
    jest.setSystemTime(NOW + 15 * MINUTE);
    const startedAt = new Date();
    jest.setSystemTime(NOW + 16 * MINUTE);
    await service.handleErpSyncError({ ...bridgeDown, kind: 'removal', message: '40 productos…' });

    await service.handleErpSyncSucceeded({ startedAt });

    expect(Object.keys(await byId()).sort()).toEqual([
      'stock',
      'sync-error-export-2026-10-28',
      'sync-error-removal-2026-10-28',
    ]);
    expect(broadcasts.at(-1)).toEqual({
      event: 'notification.deleted',
      payload: { ids: expect.arrayContaining(['old-1', 'sync-error-inbound-2026-10-28']) },
    });
  });

  it('lists the sales that failed to export and goes away once they all get through', async () => {
    const { service, firestore, byId } = setup();
    firestore.seed(Collections.NOTIFICATIONS, 'old-export', {
      type: 'sync_error',
      payload: { direction: 'outbound', message: 'x', reference: 'order-0' },
      createdAt: new Date(NOW - MINUTE),
    });
    await service.handleErpSyncError(exportFailed('order-1'));
    await service.handleErpSyncError(exportFailed('order-2'));
    await service.handleErpSyncError(exportFailed('order-1'));

    const id = 'sync-error-export-2026-10-28';
    expect((await byId())[id]).toEqual(
      expect.objectContaining({
        orderIds: ['order-1', 'order-2'],
        message:
          '2 ventas sin enviar a Profit Plus. Último error: El bridge de Profit Plus respondió 530',
      }),
    );

    await service.handleErpExportSucceeded({ orderId: 'order-0' });
    await service.handleErpExportSucceeded({ orderId: 'order-1' });
    let all = await byId();
    expect(all['old-export']).toBeUndefined();
    expect(all[id]).toEqual(
      expect.objectContaining({
        orderIds: ['order-2'],
        message: expect.stringMatching(/^Una venta sin enviar a Profit Plus/),
      }),
    );

    await service.handleErpExportSucceeded({ orderId: 'order-2' });
    all = await byId();
    expect(all[id]).toBeUndefined();
  });
});
