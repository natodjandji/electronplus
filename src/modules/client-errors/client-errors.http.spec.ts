import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AddressInfo } from 'net';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ClientErrorsModule } from './client-errors.module';

/**
 * The endpoint over real HTTP, wired the way main.ts wires the API. It's
 * the one place the suite runs Nest's Express adapter, the body parser, the
 * validation pipe and the exception filter together, so an upgrade of any
 * of them that changes what a client gets back fails here.
 */
describe('POST /client-errors over HTTP', () => {
  let app: INestApplication;
  let url: string;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeAll(async () => {
    app = await NestFactory.create(ClientErrorsModule, { bodyParser: false, logger: false });
    app.use(json({ limit: '2mb' }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as { address(): AddressInfo }).address();
    url = `http://127.0.0.1:${port}/client-errors`;
  });
  afterAll(() => app.close());

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const post = (body: string) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

  it('logs a crash report as an error', async () => {
    const res = await post(
      JSON.stringify({ message: 'x is not a function', stack: 'at y', route: '/cart' }),
    );
    expect(res.status).toBe(204);
    expect(error).toHaveBeenCalledWith('/cart · unknown · x is not a function', 'at y');
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs what the Content-Security-Policy blocked as a warning', async () => {
    const res = await post(
      JSON.stringify({
        message: 'CSP would block img-src: https://cdn.example.com/a.png',
        stack: 'https://electronplus.com.ve/assets/index.js:12',
        route: '/checkout',
        mechanism: 'csp',
      }),
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      '/checkout · csp · CSP would block img-src: https://cdn.example.com/a.png · https://electronplus.com.ve/assets/index.js:12',
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('turns away a field it does not know', async () => {
    const res = await post(JSON.stringify({ message: 'x', isAdmin: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      statusCode: 400,
      message: ['property isAdmin should not exist'],
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('answers malformed JSON with a 400', async () => {
    const res = await post('{"message":');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('answers a body over the limit with a 413, and logs no crash', async () => {
    const res = await post(JSON.stringify({ message: 'a'.repeat(2 * 1024 * 1024 + 1) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
    expect(error).not.toHaveBeenCalled();
  });
});
