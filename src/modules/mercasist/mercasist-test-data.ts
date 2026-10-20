import { Product } from '../products/entities/product.entity';
import { MercasistOrder, MercasistPublication } from './mercasist.types';

/** Test data for the Mercasist specs. */
export function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'E27-9W',
    name: 'Bombillo LED 9W E27',
    brand: 'Lucernario',
    categoryId: 'c1',
    category: { id: 'c1', code: 'BOM', label: 'Bombillos' },
    retailPrice: 10,
    wholesalePrice: 8,
    stock: 12,
    imageUrl: 'https://storage.googleapis.com/x/e27.png',
    active: true,
    ...overrides,
  } as Product;
}

export function publication(overrides: Partial<MercasistPublication> = {}): MercasistPublication {
  return {
    id: 501,
    id_ml: 'MLV123',
    tipo: 'ML',
    titulo: 'Bombillo LED 9W E27',
    sku: 'E27-9W',
    precio: 11.6,
    moneda: { nombre: 'Dólar', simbolo: 'U$S' },
    disponibilidad: 12,
    status: 'Activo',
    link_ml: 'https://articulo.mercadolibre.com.ve/MLV-123',
    variaciones: [],
    ...overrides,
  };
}

export function order(overrides: Partial<MercasistOrder> = {}): MercasistOrder {
  return {
    id: 9001,
    id_ml: '2000112345',
    estatus: 'Abierta',
    tipo: 'ML',
    moneda: 'U$S',
    fecha: '2026-10-20 10:00:00',
    total: 23.2,
    comprador: { nick: 'COMPRADOR123', nombre: 'Juan Pérez' },
    articulos: [
      { id_ml: 'MLV123', titulo: 'Bombillo LED 9W E27', sku: 'E27-9W', cantidad: 2, precio: 11.6 },
    ],
    ...overrides,
  };
}
