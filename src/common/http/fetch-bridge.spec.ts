import { fetchBridge, summarizeBody } from './fetch-bridge';

describe('fetchBridge', () => {
  afterEach(() => jest.restoreAllMocks());

  const reply = (status: number, body = '') => new Response(body, { status });

  it('retries once on a transient 502 and returns the good answer', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply(502, '<html><title>Bad gateway</title></html>'))
      .mockResolvedValueOnce(reply(200, '{"productos":[]}'));
    const res = await fetchBridge('https://bridge/x', {}, 'El bridge', 0);
    expect(await res.json()).toEqual({ productos: [] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry with a one-line reason, not the HTML page', async () => {
    // A fresh Response per call, as the network would give.
    const page =
      '<!DOCTYPE html><html><head><title>bridge | 502: Bad gateway</title></head><body>…</body></html>';
    jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(reply(502, page)));
    await expect(fetchBridge('https://bridge/x', {}, 'El bridge', 0)).rejects.toThrow(
      'El bridge respondió 502: bridge | 502: Bad gateway',
    );
  });

  it('does not retry an error that will not fix itself', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(reply(401, 'Unauthorized'));
    await expect(fetchBridge('https://bridge/x', {}, 'El bridge', 0)).rejects.toThrow(
      'El bridge respondió 401: Unauthorized',
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once when the bridge cannot be reached at all', async () => {
    const spy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchBridge('https://bridge/x', {}, 'El bridge', 0)).rejects.toThrow(
      'El bridge no respondió: ECONNREFUSED',
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('summarizes plain text and long bodies', () => {
    expect(summarizeBody('  <p>Error\n interno</p> ')).toBe('Error interno');
    expect(summarizeBody('')).toBe('sin detalle');
    expect(summarizeBody('x'.repeat(300))).toHaveLength(160);
  });
});
