import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'zlib';
import { FakeFirestore } from '../../test/fake-firestore';
import { Product } from '../products/entities/product.entity';
import { MercasistSyncService } from './mercasist-sync.service';
import { product } from './mercasist-test-data';
import { MercasistService } from './mercasist.service';

function setup(
  options: { configured?: boolean; products?: Product[]; listedSkus?: string[] } = {},
) {
  const firestore = new FakeFirestore();
  if (options.listedSkus) {
    firestore.seed('snapshots', 'mercasist-publications', {
      at: '2026-10-20T12:00:00.000Z',
      rows: options.listedSkus.map((sku, i) => ({
        id: i + 1,
        idMl: null,
        sku,
        title: sku,
        status: 'Activo',
        price: 1,
        stock: 1,
      })),
    });
  }
  const client = { isConfigured: () => options.configured ?? true, quota: () => undefined };
  const products = { allForMarketplace: async () => options.products ?? [] };
  const sync = new MercasistSyncService(
    firestore as never,
    client as never,
    products as never,
    { emit: jest.fn() } as never,
  );
  return {
    firestore,
    service: new MercasistService(firestore as never, client as never, sync, products as never),
  };
}

/** The shared strings of a built workbook (its text cells, in order of first use). */
function sharedStrings(buffer: Buffer): string[] {
  const marker = Buffer.from('xl/sharedStrings.xml');
  const header = buffer.indexOf(marker) - 30;
  const size = buffer.readUInt32LE(header + 18);
  const start = header + 30 + marker.length;
  const xml = inflateRawSync(buffer.subarray(start, start + size)).toString('utf8');
  return [...xml.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
}

describe('MercasistService', () => {
  it("won't turn the sync on without the token", async () => {
    await expect(
      setup({ configured: false }).service.updateSettings({ enabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves only the settings sent', async () => {
    const { firestore, service } = setup();
    await service.updateSettings({ safetyStock: 2 });
    const status = await service.updateSettings({ enabled: true, syncPrice: false });
    expect(firestore.read('settings', 'mercasist')).toEqual({
      safetyStock: 2,
      enabled: true,
      syncPrice: false,
    });
    expect(status).toMatchObject({
      enabled: true,
      syncPrice: false,
      syncStock: true,
      safetyStock: 2,
      listingType: 'gold_special',
    });
  });

  it("offers for the Excel only what isn't on Mercado Libre yet and can be", async () => {
    const { service } = setup({
      listedSkus: ['e27-9w'],
      products: [
        product(),
        product({ id: 'a', sku: 'A' }),
        product({ id: 'b', sku: 'B', imageUrl: undefined }),
        product({ id: 'c', sku: 'C', stock: 0 }),
        product({ id: 'd', sku: 'D', imageUrl: undefined }),
      ],
    });
    expect(await service.exportSummary()).toEqual({
      ready: 1,
      published: 1,
      blocked: [
        { reason: 'Sin foto', count: 2 },
        { reason: 'Sin stock', count: 1 },
      ],
      snapshotAt: '2026-10-20T12:00:00.000Z',
    });
  });

  it("splits the Excel in groups for Mercasist's trial", async () => {
    const products = ['A', 'B', 'C'].map((sku) =>
      product({ id: sku, sku, name: `Producto ${sku}` }),
    );
    const { service } = setup({ products, listedSkus: [] });
    const second = await service.exportXlsx(2, 2);
    expect(second).toMatchObject({ count: 1 });
    expect(second.filename).toMatch(/^electronplus-mercado-libre-\d{4}-\d{2}-\d{2}-lote-2\.xlsx$/);
    expect(sharedStrings(second.buffer)).toContain('Producto C');
    expect(sharedStrings(second.buffer)).not.toContain('Producto A');
    await expect(service.exportXlsx(3, 2)).rejects.toBeInstanceOf(BadRequestException);
  });
});
