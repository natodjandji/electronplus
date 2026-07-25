import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Bucket } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { FIREBASE_STORAGE_BUCKET } from '../../firebase/firebase.constants';

const DATA_URI_PATTERN = /^data:image\/(png|jpe?g|webp);base64,(.+)$/;

// Long-lived — files are stored under a random, never-reused id, so a
// cached copy never goes stale; a "new" image is just a new URL.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface UploadedImage {
  url: string;
  thumbnailUrl: string;
}

@Injectable()
export class UploadsService {
  constructor(@Inject(FIREBASE_STORAGE_BUCKET) private readonly bucket: Bucket) {}

  /** Re-encodes to WebP at two sizes (full ~1280px, thumbnail ~400px) and
   * uploads both under products/ — the one path storage.rules allows
   * public read on. The client already downscales before sending, so this
   * is mainly a format conversion (smaller than JPEG at equal quality) and
   * the thumbnail variant no page needs to load the full image for. */
  async uploadProductImage(dataUri: string): Promise<UploadedImage> {
    const buffer = decodeDataUri(dataUri);
    const id = randomUUID();

    const [full, thumb] = await Promise.all([
      sharp(buffer)
        .rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer(),
    ]);

    const fullPath = `products/${id}.webp`;
    const thumbPath = `products/${id}_thumb.webp`;
    await Promise.all([this.putObject(fullPath, full), this.putObject(thumbPath, thumb)]);

    return { url: this.publicUrl(fullPath), thumbnailUrl: this.publicUrl(thumbPath) };
  }

  /** Payment-proof screenshots are sensitive — private path, no public URL.
   * Returns the storage path to persist (e.g. as Payment.proofUrl); resolve
   * it to a short-lived signed URL at read time via getSignedProofUrl(). */
  async uploadPaymentProof(dataUri: string): Promise<string> {
    const buffer = decodeDataUri(dataUri);
    const path = `payment-proofs/${randomUUID()}.webp`;
    const webp = await sharp(buffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    await this.putObject(path, webp);
    return path;
  }

  async getSignedProofUrl(path: string): Promise<string> {
    const [url] = await this.bucket.file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
    return url;
  }

  private async putObject(path: string, buffer: Buffer): Promise<void> {
    await this.bucket.file(path).save(buffer, {
      contentType: 'image/webp',
      metadata: { cacheControl: CACHE_CONTROL },
    });
  }

  private publicUrl(path: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
  }
}

/** True for a bare Storage object path (new-style, e.g. "payment-proofs/xyz.webp")
 * as opposed to a legacy base64 data URI or an already-resolved URL — lets
 * read paths stay backward compatible with proof values saved before this
 * migration, with zero data backfill required. */
export function isStoragePath(value: string): boolean {
  return !value.startsWith('data:') && !value.startsWith('http');
}

function decodeDataUri(dataUri: string): Buffer {
  const match = DATA_URI_PATTERN.exec(dataUri);
  if (!match) throw new BadRequestException('image must be a base64 image data URI');
  return Buffer.from(match[2], 'base64');
}
