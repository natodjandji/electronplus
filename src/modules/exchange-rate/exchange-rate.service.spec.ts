import { ExchangeRateService } from './exchange-rate.service';

describe('ExchangeRateService', () => {
  afterEach(() => jest.restoreAllMocks());

  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('shares one upstream call among requests that arrive together', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () =>
        reply({ promedio: 191.42, fechaActualizacion: '2026-10-13' }),
      );
    const service = new ExchangeRateService();
    const rates = await Promise.all([
      service.getBcvRate(),
      service.getBcvRate(),
      service.getBcvRate(),
    ]);
    expect(rates.map((r) => r.rate)).toEqual([191.42, 191.42, 191.42]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never accepts a rate that would price everything at zero', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => reply({ promedio: 0 }));
    await expect(new ExchangeRateService().getBcvRate()).rejects.toThrow('Unexpected BCV rate');
  });

  it('keeps serving the last good rate when the source fails', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => reply({ promedio: 190 }));
    const service = new ExchangeRateService();
    await service.getBcvRate();
    // Force the cache to expire, then fail the refresh.
    (service as unknown as { cachedAt: number }).cachedAt = 0;
    spy.mockImplementationOnce(async () => {
      throw new Error('timeout');
    });
    expect((await service.getBcvRate()).rate).toBe(190);
  });
});
