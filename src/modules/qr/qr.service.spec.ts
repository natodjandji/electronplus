import { NotFoundException } from '@nestjs/common';
import { QrService } from './qr.service';

describe('QrService group labels', () => {
  const groups = [
    { id: 'k7m2p9qa', name: 'Panel LED Borde Infinito', productIds: ['a', 'b', 'c', 'd'] },
  ];
  const service = new QrService(
    {} as never,
    { findByIds: async (ids: string[]) => groups.filter((g) => ids.includes(g.id)) } as never,
    { get: () => 'https://electronplus.com.ve' } as never,
  );

  it("points the QR at the group's page on the store and counts its products", async () => {
    const [label] = await service.issueGroupLabels(['k7m2p9qa']);
    expect(label).toMatchObject({
      groupId: 'k7m2p9qa',
      name: 'Panel LED Borde Infinito',
      count: 4,
      groupUrl: 'https://electronplus.com.ve/grupo/k7m2p9qa',
    });
    expect(label.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('says which groups are missing', async () => {
    await expect(service.issueGroupLabels(['k7m2p9qa', 'zzzzzzzz'])).rejects.toThrow(
      new NotFoundException('Grupo(s) no encontrados: zzzzzzzz'),
    );
  });
});
