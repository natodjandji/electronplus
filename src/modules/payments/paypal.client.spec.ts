import { PayPalClient } from './paypal.client';

describe('PayPalClient.captureOrder', () => {
  afterEach(() => jest.restoreAllMocks());

  const env: Record<string, string> = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret' };
  const client = () => new PayPalClient({ get: (key: string) => env[key] } as never);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const token = () => json(200, { access_token: 't', expires_in: 3600 });
  const capturedOrder = (status: string) => ({
    status: 'COMPLETED',
    purchase_units: [
      {
        payments: {
          captures: [{ id: 'cap-1', status, amount: { value: '41.76', currency_code: 'USD' } }],
        },
      },
    ],
  });

  it('reads the charge itself, not just the order', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(201, capturedOrder('PENDING')));

    expect(await client().captureOrder('ORDER-1')).toEqual({
      status: 'COMPLETED',
      capture: { id: 'cap-1', status: 'PENDING', amount: 41.76, currency: 'USD' },
    });
  });

  it('reads the order when a lost answer makes the retry say it was already captured', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }))
      .mockResolvedValueOnce(json(200, capturedOrder('COMPLETED')));

    const result = await client().captureOrder('ORDER-1');
    expect(result.capture).toMatchObject({ status: 'COMPLETED', amount: 41.76 });
    expect(spy.mock.calls[2][0]).toMatch(/\/v2\/checkout\/orders\/ORDER-1$/);
  });

  it('fails on any other PayPal error', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(422, { details: [{ issue: 'INSTRUMENT_DECLINED' }] }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(client().captureOrder('ORDER-1')).rejects.toThrow('PayPal capture failed');
  });
});
