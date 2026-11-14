import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AddressInfo } from 'net';
import { FIREBASE_AUTH, FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { Product } from '../products/entities/product.entity';
import { PricingService } from '../products/pricing.service';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';

// Exercise the real auth/role guards, DTO validation, mapper and HTTP response
// against in-memory storage. No Firebase credentials or production writes.
describe('Product groups over HTTP', () => {
  let app: INestApplication;
  let url: string;
  const firestore = new FakeFirestore();
  const products = ['panel-warm', 'panel-cool'].map((id) => ({
    id,
    sku: id,
    model: id,
    name: id,
    active: true,
    cost: 2,
    retailPrice: 10,
    wholesalePrice: 8,
    stock: 5,
    category: { id: 'lighting', code: 'lighting', label: 'Iluminación' },
  })) as Product[];
  const catalog = {
    activeCatalog: jest.fn(async () => products),
    findByIds: jest.fn(async (ids: string[]) => products.filter((p) => ids.includes(p.id))),
  };
  const groups = new ProductGroupsService(firestore as never, catalog as never);

  beforeAll(async () => {
    @Module({
      controllers: [ProductGroupsController],
      providers: [
        { provide: ProductGroupsService, useValue: groups },
        { provide: PricingService, useValue: { priceFor: (p: Product) => p.retailPrice } },
        { provide: FIRESTORE, useValue: firestore },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        {
          provide: FIREBASE_AUTH,
          useValue: {
            verifyIdToken: async (token: string) => {
              if (!['admin', 'seller', 'client', 'warehouse_operator'].includes(token))
                throw new Error('invalid token');
              return { uid: `test-${token}`, role: token };
            },
          },
        },
      ],
    })
    class ProductGroupsTestModule {}
    app = await NestFactory.create(ProductGroupsTestModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/product-groups`;
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    firestore.seed(Collections.PRODUCT_GROUPS, 'abcd2345', {
      name: 'Paneles',
      productIds: ['panel-cool', 'panel-warm'],
    });
  });

  const request = (path: string, method = 'GET', role?: string, body?: unknown) =>
    fetch(`${url}${path}`, {
      method,
      headers: {
        ...(role ? { Authorization: `Bearer ${role}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it.each([undefined, 'seller', 'client'])(
    'serves the ordered public list to %s without costs or per-product reads',
    async (role) => {
      const res = await request('/abcd2345', 'GET', role);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.products.map((p: Product) => p.id)).toEqual(['panel-cool', 'panel-warm']);
      expect(body.products[0]).toMatchObject({ retailPrice: 10, wholesalePrice: 8 });
      expect(body.products[0]).not.toHaveProperty('cost');
      expect(catalog.findByIds).not.toHaveBeenCalled();
      expect(res.headers.get('vary')).toContain('Authorization');
      expect(res.headers.get('cache-control')).toBe(
        role ? 'private, no-store' : 'public, max-age=60',
      );
    },
  );

  it.each([
    ['GET', ''],
    ['POST', ''],
    ['PATCH', '/abcd2345'],
    ['DELETE', '/abcd2345'],
  ])('protects %s %s from anonymous visitors and non-admin staff', async (method, path) => {
    for (const role of [undefined, 'seller', 'warehouse_operator', 'client']) {
      expect((await request(path, method, role)).status).toBe(role ? 403 : 401);
    }
  });

  it.each([['panel-warm'], ['panel-warm', 'panel-warm'], Array(41).fill('panel-warm')])(
    'rejects invalid membership before saving: %j',
    async (productIds) => {
      const res = await request('', 'POST', 'admin', { name: 'Paneles', productIds });
      expect(res.status).toBe(400);
    },
  );

  it('creates, edits without changing the code, then deletes with the empty 204 expected by apiFetch', async () => {
    const create = await request('', 'POST', 'admin', {
      name: '  Paneles nuevos  ',
      productIds: ['panel-warm', 'panel-cool'],
    });
    expect(create.status).toBe(201);
    const saved = await create.json();
    expect(saved.name).toBe('Paneles nuevos');
    const edit = await request(`/${saved.id}`, 'PATCH', 'admin', {
      name: 'Paneles editados',
      productIds: ['panel-cool', 'panel-warm'],
    });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toMatchObject({
      id: saved.id,
      name: 'Paneles editados',
      productIds: ['panel-cool', 'panel-warm'],
    });
    const deleted = await request(`/${saved.id}`, 'DELETE', 'admin');
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    expect((await request(`/${saved.id}`)).status).toBe(404);
  });
});
