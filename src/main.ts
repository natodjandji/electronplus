import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.validation';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  // bodyParser disabled here so the larger limits below (needed for a
  // base64 payment-proof image) replace Nest's default 100kb parser
  // instead of stacking behind it.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ limit: '2mb', extended: true }));
  // Sets standard defensive headers (X-Content-Type-Options, X-Frame-Options,
  // etc.) that Cloud Run/GFE don't add on their own. CSP is left at helmet's
  // default (off) since this is a pure JSON API, not an HTML-serving app.
  app.use(helmet());

  const config = app.get(ConfigService<EnvConfig, true>);

  // Cloud Run terminates TLS and proxies every request through Google Front
  // End, so without this, Express's req.ip is the GFE hop, not the real
  // client — every caller would share one IP bucket for @nestjs/throttler's
  // per-IP rate limiting, making it protect nobody. `1` trusts exactly the
  // one hop Cloud Run adds.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const apiPrefix = config.get('API_PREFIX', { infer: true });
  app.setGlobalPrefix(apiPrefix);

  // Auth is a Bearer token in the Authorization header, not a cookie, so
  // credentialed CORS isn't needed — and it's invalid alongside a wildcard
  // origin anyway (browsers reject that combination).
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // The full API surface (every route, every DTO field name/type) is
  // otherwise publicly browsable with no auth — fine for local dev, not
  // something to expose on the live API.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Electron Plus API')
      .setDescription(
        'Backend for Electron Plus — catalog, pricing, quotes, orders, payments, Profit Plus ERP sync, finance, reports and QR.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

bootstrap();
