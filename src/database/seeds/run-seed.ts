import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { CategoriesService } from '../../modules/products/categories.service';
import { QueryProductsDto } from '../../modules/products/dto/query-products.dto';
import { ProductsService } from '../../modules/products/products.service';
import { WarehousesService } from '../../modules/products/warehouses.service';

const logger = new Logger('Seed');

const CATEGORIES = [
  { code: 'iluminacion', label: 'Iluminación' },
  { code: 'cables', label: 'Cables' },
  { code: 'tableros', label: 'Tableros' },
  { code: 'tomas', label: 'Tomas e interruptores' },
  { code: 'proteccion', label: 'Protección' },
];

const WAREHOUSES = [
  { code: 'DEP-A', name: 'Depósito A' },
  { code: 'DEP-B', name: 'Depósito B' },
  { code: 'DEP-C', name: 'Depósito C' },
];

const PRODUCTS = [
  {
    sku: 'EP-LED-9W',
    name: 'Bombillo LED 9W E27 luz fría',
    category: 'iluminacion',
    retailPrice: 4.5,
    wholesalePrice: 3.2,
    cost: 2.1,
    stock: 320,
    specs: '9W · 220V · 6500K · 900lm · Base E27',
    imageUrl: 'https://images.unsplash.com/photo-1553501128-b6b6d8b6f2ec?w=600&auto=format',
  },
  {
    sku: 'EP-CBL-12AWG',
    name: 'Cable THHN 12 AWG (rollo 100m)',
    category: 'cables',
    retailPrice: 68,
    wholesalePrice: 55,
    cost: 42,
    stock: 12,
    specs: 'Cobre 100% · 600V · Aislamiento THHN/THWN',
    imageUrl: 'https://images.unsplash.com/photo-1620325867502-221cfb5faa5f?w=600&auto=format',
  },
  {
    sku: 'EP-BRK-2P32',
    name: 'Breaker enchufable 2P 32A',
    category: 'proteccion',
    retailPrice: 14.9,
    wholesalePrice: 11.4,
    cost: 8.2,
    stock: 4,
    specs: 'Bipolar · 32A · 10kA · Curva C',
    imageUrl: 'https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?w=600&auto=format',
  },
  {
    sku: 'EP-PNL-8C',
    name: 'Tablero eléctrico 8 circuitos',
    category: 'tableros',
    retailPrice: 42,
    wholesalePrice: 34,
    cost: 26,
    stock: 0,
    specs: '8 espacios · Empotrable · Barra neutro/tierra',
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format',
  },
  {
    sku: 'EP-TC-DPL',
    name: 'Toma doble polarizada con tierra',
    category: 'tomas',
    retailPrice: 3.1,
    wholesalePrice: 2.25,
    cost: 1.4,
    stock: 540,
    specs: '15A · 125V · Placa blanca',
    imageUrl: 'https://images.unsplash.com/photo-1519824145371-296894a0daa9?w=600&auto=format',
  },
  {
    sku: 'EP-LED-PNL-24W',
    name: 'Panel LED plafón 24W redondo',
    category: 'iluminacion',
    retailPrice: 12.5,
    wholesalePrice: 9.6,
    cost: 6.8,
    stock: 78,
    specs: '24W · 4000K · 2000lm · Empotrable Ø225mm',
    imageUrl: 'https://images.unsplash.com/photo-1524634126442-357e0eac3c14?w=600&auto=format',
  },
  {
    sku: 'EP-CBL-10AWG',
    name: 'Cable THHN 10 AWG (rollo 100m)',
    category: 'cables',
    retailPrice: 92,
    wholesalePrice: 76,
    cost: 58,
    stock: 6,
    specs: 'Cobre 100% · 600V · Aislamiento THHN',
    imageUrl: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?w=600&auto=format',
  },
  {
    sku: 'EP-INT-1V',
    name: 'Interruptor 1 vía blanco',
    category: 'tomas',
    retailPrice: 2.4,
    wholesalePrice: 1.8,
    cost: 1.1,
    stock: 420,
    specs: '10A · 250V · Instalación empotrada',
    imageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format',
  },
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const categoriesService = app.get(CategoriesService);
  const warehousesService = app.get(WarehousesService);
  const productsService = app.get(ProductsService);

  logger.log('Seeding categories…');
  const categoryByCode = new Map<string, string>();
  for (const c of CATEGORIES) {
    const category = await categoriesService.findOrCreateByCode(c.code, c.label);
    categoryByCode.set(c.code, category.id);
  }

  logger.log('Seeding warehouses…');
  const existingWarehouses = await warehousesService.findAll();
  for (const w of WAREHOUSES) {
    if (!existingWarehouses.some((existing) => existing.code === w.code)) {
      await warehousesService.create(w.code, w.name);
    }
  }

  logger.log('Seeding products…');
  const existingProducts = await productsService.findAll({ limit: 1000 } as QueryProductsDto);
  const existingSkus = new Set(existingProducts.data.map((p) => p.sku));
  for (const p of PRODUCTS) {
    if (existingSkus.has(p.sku)) continue;
    const created = await productsService.create({
      sku: p.sku,
      name: p.name,
      categoryId: categoryByCode.get(p.category)!,
      retailPrice: p.retailPrice,
      wholesalePrice: p.wholesalePrice,
      cost: p.cost,
      specs: p.specs,
      imageUrl: p.imageUrl,
    });
    // create() doesn't set stock (defaults to 0) — set it explicitly to mirror the mock data.
    await productsService.adjustStock(created.id, { delta: p.stock });
  }

  logger.log(
    'Seed complete. No demo users were created — Google Sign-In accounts only exist after a real sign-in. ' +
      'Sign in once through the frontend, then run `npm run set-user-role -- <email> admin` to promote that account.',
  );
  await app.close();
  // BullMQ worker connections can keep the event loop alive past close() —
  // this is a one-shot script, so force the exit instead of hanging.
  process.exit(0);
}

run().catch((error) => {
  logger.error('Seed failed', error);
  process.exit(1);
});
