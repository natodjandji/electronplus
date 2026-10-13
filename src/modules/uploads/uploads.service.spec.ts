import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  function setup() {
    const saved: { path: string; bytes: number }[] = [];
    const bucket = {
      name: 'test-bucket',
      file: (path: string) => ({
        save: async (buffer: Buffer) => {
          saved.push({ path, bytes: buffer.length });
        },
      }),
    };
    return { service: new UploadsService(bucket as never), saved };
  }

  const png = async (width: number, height: number) =>
    `data:image/png;base64,${(
      await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
        .png({ compressionLevel: 9 })
        .toBuffer()
    ).toString('base64')}`;

  it('stores a normal photo as WebP under a private path', async () => {
    const { service, saved } = setup();
    const path = await service.uploadPaymentProof(await png(800, 600));
    expect(path).toMatch(/^payment-proofs\/[0-9a-f-]{36}\.webp$/);
    expect(saved).toHaveLength(1);
  });

  it('refuses an image that declares a huge canvas before decoding it', async () => {
    const { service, saved } = setup();
    // About 440 KB on the wire, ~400 MB of pixels once decoded.
    const bomb = await png(12000, 12000);
    await expect(service.uploadPaymentProof(bomb)).rejects.toThrow(BadRequestException);
    await expect(service.uploadProductImage(bomb)).rejects.toThrow(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('answers 400, not 500, for bytes that are not an image', async () => {
    const { service } = setup();
    const garbage = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
    await expect(service.uploadPaymentProof(garbage)).rejects.toThrow(BadRequestException);
  });
});
