import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function reply(exception: unknown) {
  const json = jest.fn((_body: object) => undefined);
  const status = jest.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/orders' }),
    }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

/** Shaped like what body-parser raises through http-errors. */
function httpError(status: number, message: string, expose = status < 500) {
  return Object.assign(new Error(message), { status, statusCode: status, expose });
}

describe('GlobalExceptionFilter', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('passes an HttpException through', () => {
    const { status, body } = reply(new NotFoundException('Pedido no encontrado'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ statusCode: 404, message: 'Pedido no encontrado' });
  });

  it("answers a body over the limit with body-parser's 413, not a 500", () => {
    const { status, body } = reply(httpError(413, 'request entity too large'));
    expect(status).toBe(413);
    expect(body).toMatchObject({
      statusCode: 413,
      message: 'request entity too large',
      error: 'Payload Too Large',
      path: '/api/orders',
    });
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('hides anything else behind a logged 500', () => {
    for (const exception of [
      new Error('Firestore exploded: secret detail'),
      httpError(400, 'not marked safe to show', false),
      httpError(503, 'upstream down'),
      'a thrown string',
    ]) {
      const { status, body } = reply(exception);
      expect(status).toBe(500);
      expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    }
    expect(Logger.prototype.error).toHaveBeenCalledTimes(4);
  });
});
