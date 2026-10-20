import { describeError, MercasistClient, MercasistError } from './mercasist.client';

const ENV: Record<string, unknown> = {
  MERCASIST_API_TOKEN: 'tok-123',
  MERCASIST_API_URL: 'https://api.mercasist.com/',
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

describe('MercasistClient', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => (fetchMock = jest.spyOn(global, 'fetch')));
  afterEach(() => fetchMock.mockRestore());

  const client = (env = ENV) => {
    const c = new MercasistClient({ get: (key: string) => env[key] } as never);
    jest.spyOn(c, 'sleep').mockResolvedValue(undefined);
    return c;
  };
  const call = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  it('is configured once the token is set', () => {
    expect(client().isConfigured()).toBe(true);
    expect(client({ ...ENV, MERCASIST_API_TOKEN: undefined }).isConfigured()).toBe(false);
  });

  it('sends the token as a Bearer header, never in the URL', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [] }));
    await client().get('/publicaciones', { tipo: 'ML', q: undefined, limit: 1 });
    const { url, headers } = call();
    expect(url).toBe('https://api.mercasist.com/publicaciones?tipo=ML&limit=1');
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(url).not.toContain('tok-123');
  });

  it('walks every page, one after another', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(200, { data: [{ id: 1 }, { id: 2 }], pagination: { has_more: true } }),
      )
      .mockResolvedValueOnce(json(200, { data: [{ id: 3 }], pagination: { has_more: false } }));
    const items = await client().listAll('/publicaciones', { tipo: 'ML' }, 2);
    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(call(1).url).toBe('https://api.mercasist.com/publicaciones?tipo=ML&limit=2&offset=2');
  });

  it('waits out a short 429 and retries', async () => {
    const c = client();
    fetchMock
      .mockResolvedValueOnce(json(429, { error: 'Límite' }, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(json(200, { data: { id: 1 } }));
    await expect(c.patch('/publicaciones/1', { precio: 5 })).resolves.toEqual({ data: { id: 1 } });
    expect(c.sleep).toHaveBeenCalledWith(3000);
    expect(JSON.parse(call(1).init.body as string)).toEqual({ precio: 5 });
  });

  it("gives up on a long 429 (the daily quota) with Mercasist's message", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        { error: 'Límite de 10000 solicitudes por día alcanzado.' },
        { 'Retry-After': '30000' },
      ),
    );
    const error = await client()
      .get('/ordenes')
      .catch((e) => e);
    expect(error).toBeInstanceOf(MercasistError);
    expect(error).toMatchObject({
      status: 429,
      message: 'Límite de 10000 solicitudes por día alcanzado.',
    });
  });

  it('remembers the daily quota Mercasist reports', async () => {
    const c = client();
    fetchMock.mockResolvedValue(
      json(
        200,
        { data: [] },
        { 'X-RateLimit-Remaining-Day': '9876', 'X-RateLimit-Limit-Day': '10000' },
      ),
    );
    await c.get('/ordenes');
    expect(c.quota()).toMatchObject({ remainingDay: 9876, limitDay: 10000 });
  });

  it('refuses to call without a token', async () => {
    await expect(
      client({ ...ENV, MERCASIST_API_TOKEN: undefined }).get('/x'),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns network failures into a 503 with the reason', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(client().get('/x')).rejects.toMatchObject({ status: 503 });
  });

  it('explains errors for the admin', () => {
    expect(describeError(401, '{"error":"Token invalido"}')).toContain('MERCASIST_API_TOKEN');
    expect(describeError(400, '{"error":"El precio debe ser un numero mayor a 0"}')).toBe(
      'Mercasist: El precio debe ser un numero mayor a 0',
    );
    expect(describeError(500, '<html>')).toBe('Mercasist respondió 500.');
  });
});
