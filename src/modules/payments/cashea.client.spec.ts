import { CasheaClient, CasheaError, describeError } from './cashea.client';

const ENV: Record<string, unknown> = {
  CASHEA_PUBLIC_KEY: 'pub-key',
  CASHEA_PRIVATE_KEY: 'priv-key',
  CASHEA_EXTERNAL_CLIENT_ID: '351',
  CASHEA_STORE_ID: 123,
  CASHEA_API_URL: 'https://external.cashea.app',
  CASHEA_CHECKOUT_URL: 'https://web.cashea.app/',
};

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('CasheaClient', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => (fetchMock = jest.spyOn(global, 'fetch')));
  afterEach(() => fetchMock.mockRestore());

  const client = (env = ENV) => new CasheaClient({ get: (key: string) => env[key] } as never);
  const call = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  it('is offered only with both keys, the client id and the store id', () => {
    expect(client().isConfigured()).toBe(true);
    expect(client({ ...ENV, CASHEA_PRIVATE_KEY: undefined }).isConfigured()).toBe(false);
    expect(client({ ...ENV, CASHEA_STORE_ID: undefined }).isConfigured()).toBe(false);
  });

  it('creates the checkout with the public key and returns where the buyer goes', async () => {
    fetchMock.mockResolvedValue(json(201, 98765));
    const result = await client().createCheckout({ invoiceId: 'order-1' } as never);
    expect(result).toEqual({
      payloadId: 98765,
      checkoutUrl: 'https://web.cashea.app/checkout?order-payload-id=98765',
    });
    const { url, init, headers } = call();
    expect(url).toBe('https://external.cashea.app/web-checkout/payload');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe('ApiKey pub-key');
    expect(JSON.parse(init.body as string)).toEqual({ invoiceId: 'order-1' });
  });

  it('also reads a checkout id wrapped in an object', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 42 }));
    await expect(client().createCheckout({} as never)).resolves.toMatchObject({ payloadId: 42 });
  });

  it('refuses a checkout answer without an id', async () => {
    fetchMock.mockResolvedValue(json(201, { ok: true }));
    await expect(client().createCheckout({} as never)).rejects.toBeInstanceOf(CasheaError);
  });

  it('confirms the down payment and cancels with the private key only', async () => {
    fetchMock.mockResolvedValue(json(201, undefined));
    await client().confirmDownPayment('777', 20.5);
    fetchMock.mockResolvedValue(json(200, undefined));
    await client().cancelOrder('777');
    expect(call(0)).toMatchObject({
      url: 'https://external.cashea.app/orders/777/down-payment',
      init: { method: 'POST', body: JSON.stringify({ amount: 20.5 }) },
      headers: { Authorization: 'ApiKey priv-key' },
    });
    expect(call(1)).toMatchObject({
      url: 'https://external.cashea.app/orders/777',
      init: { method: 'DELETE' },
      headers: { Authorization: 'ApiKey priv-key' },
    });
  });

  it('reports what Cashea refused, with its status', async () => {
    fetchMock.mockResolvedValue(json(400, { message: ['amount must be positive'] }));
    await expect(client().confirmDownPayment('777', 0)).rejects.toMatchObject({
      status: 400,
      message: 'amount must be positive',
    });
  });

  it('reads the minimum purchase once, and lets checkout go on when Cashea is unreachable', async () => {
    fetchMock.mockResolvedValue(json(200, { minAmount: 20 }));
    const cashea = client();
    expect(await cashea.minAmount()).toBe(20);
    expect(await cashea.minAmount()).toBe(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call().headers.Authorization).toBe('ApiKey pub-key');

    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    expect(await client().minAmount()).toBeNull();
  });

  it('never calls Cashea without its key', async () => {
    await expect(
      client({ ...ENV, CASHEA_PRIVATE_KEY: undefined }).cancelOrder('777'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('describeError', () => {
  it('turns Cashea’s error body into one line', () => {
    expect(describeError(404, JSON.stringify({ message: 'Order not found' }))).toBe(
      'Order not found',
    );
    expect(describeError(502, '<html>')).toBe('Cashea respondió 502');
  });
});
