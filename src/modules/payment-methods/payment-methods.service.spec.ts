import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { PaymentMethodsService } from './payment-methods.service';

const CONFIGURED: Record<string, unknown> = {
  CASHEA_PUBLIC_KEY: 'pub',
  CASHEA_PRIVATE_KEY: 'priv',
  CASHEA_EXTERNAL_CLIENT_ID: '351',
  CASHEA_STORE_ID: 123,
};

describe('PaymentMethodsService · Cashea', () => {
  function build(env: Record<string, unknown>) {
    const firestore = new FakeFirestore();
    firestore.seed(Collections.PAYMENT_METHODS, 'pago-movil', {
      backendMethod: PaymentMethod.PAGO_MOVIL,
      label: 'Pago móvil',
      details: [],
      needsReference: true,
      needsProof: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new PaymentMethodsService(
      firestore as never,
      { get: (key: string) => env[key] } as never,
    );
    return { service, firestore };
  }

  it('adds Cashea switched off once its credentials are set, so an admin turns it on', async () => {
    const { service, firestore } = build(CONFIGURED);
    const cashea = (await service.list()).find((m) => m.backendMethod === PaymentMethod.CASHEA);
    expect(cashea).toMatchObject({ id: 'cashea', label: 'Cashea', enabled: false });
    // The admin's choice sticks: it isn't re-created or switched off again.
    await service.update('cashea', { enabled: true });
    await service.list();
    expect(firestore.read(Collections.PAYMENT_METHODS, 'cashea')).toMatchObject({ enabled: true });
  });

  it('hides Cashea while its credentials aren’t set, even if switched on', async () => {
    const { service, firestore } = build({});
    firestore.seed(Collections.PAYMENT_METHODS, 'cashea', {
      backendMethod: PaymentMethod.CASHEA,
      label: 'Cashea',
      details: [],
      needsReference: false,
      needsProof: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const methods = await service.list();
    expect(methods.map((m) => m.id)).toEqual(['pago-movil']);
  });
});
