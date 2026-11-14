import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FakeFirestore } from '../../test/fake-firestore';
import { Collections } from '../../firebase/firestore-collections';
import { Product } from '../products/entities/product.entity';
import { newGroupId, ProductGroupsService } from './product-groups.service';

const product = (id: string, extra: Partial<Product> = {}) =>
  ({ id, sku: `SKU-${id}`, name: `Producto ${id}`, active: true, ...extra }) as Product;

describe('ProductGroupsService', () => {
  function build() {
    const firestore = new FakeFirestore();
    const all = [
      product('panel-3k'),
      product('panel-6k'),
      product('panel-4k'),
      product('viejo', { active: false }),
    ];
    const productsService = {
      activeCatalog: jest.fn(async () => all.filter((p) => p.active)),
      findByIds: jest.fn(async (ids: string[]) => all.filter((p) => ids.includes(p.id))),
    };
    const service = new ProductGroupsService(firestore as never, productsService as never);
    return { firestore, service, productsService };
  }

  it('saves a group under a short, readable code, keeping the order and a clean name', async () => {
    const { firestore, service } = build();
    const group = await service.create({
      name: '  Panel   LED Borde Infinito ',
      productIds: ['panel-6k', 'panel-3k'],
    });
    expect(group.id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
    expect(firestore.read(Collections.PRODUCT_GROUPS, group.id)).toMatchObject({
      name: 'Panel LED Borde Infinito',
      productIds: ['panel-6k', 'panel-3k'],
    });
  });

  it('refuses a product the store does not have, and an empty name', async () => {
    const { service } = build();
    await expect(
      service.create({ name: 'Paneles', productIds: ['panel-3k', 'no-existe'] }),
    ).rejects.toThrow(new BadRequestException('Productos que no existen: no-existe'));
    await expect(
      service.create({ name: '   ', productIds: ['panel-3k', 'panel-6k'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('opens with the products on sale, in the group order, from the catalog in memory', async () => {
    const { firestore, service, productsService } = build();
    firestore.seed(Collections.PRODUCT_GROUPS, 'abcd2345', {
      name: 'Paneles',
      productIds: ['panel-6k', 'viejo', 'borrado', 'panel-3k'],
    });
    const group = await service.getPublic('abcd2345');
    expect(group).toEqual({
      id: 'abcd2345',
      name: 'Paneles',
      products: [
        expect.objectContaining({ id: 'panel-6k' }),
        expect.objectContaining({ id: 'panel-3k' }),
      ],
    });
    expect(productsService.findByIds).not.toHaveBeenCalled();
  });

  it('says a group that is gone is not found', async () => {
    const { service } = build();
    await expect(service.getPublic('nadaaqui')).rejects.toThrow(NotFoundException);
  });

  it('renames, changes the products, and deletes', async () => {
    const { firestore, service } = build();
    const group = await service.create({ name: 'Paneles', productIds: ['panel-3k', 'panel-6k'] });

    await service.update(group.id, { name: 'Paneles redondos' });
    expect(firestore.read(Collections.PRODUCT_GROUPS, group.id)).toMatchObject({
      name: 'Paneles redondos',
      productIds: ['panel-3k', 'panel-6k'],
    });
    await service.update(group.id, { productIds: ['panel-4k', 'panel-3k', 'panel-6k'] });
    expect(firestore.read(Collections.PRODUCT_GROUPS, group.id)).toMatchObject({
      productIds: ['panel-4k', 'panel-3k', 'panel-6k'],
    });
    await expect(service.update(group.id, { productIds: ['panel-3k', 'x'] })).rejects.toThrow(
      BadRequestException,
    );

    await service.delete(group.id);
    expect(firestore.read(Collections.PRODUCT_GROUPS, group.id)).toBeUndefined();
    await expect(service.delete(group.id)).rejects.toThrow(NotFoundException);
  });

  it('lists groups by name', async () => {
    const { firestore, service } = build();
    firestore.seed(Collections.PRODUCT_GROUPS, 'bbbbbbbb', { name: 'Spots', productIds: [] });
    firestore.seed(Collections.PRODUCT_GROUPS, 'aaaaaaaa', { name: 'Apliques', productIds: [] });
    expect((await service.list()).map((g) => g.name)).toEqual(['Apliques', 'Spots']);
  });

  it('makes codes that differ', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newGroupId()));
    expect(ids.size).toBe(200);
  });
});
