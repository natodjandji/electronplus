import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';

const logger = new Logger('BrandAssets');

/** Content-IDs the templates reference as `cid:<id>` in <img> tags. Sent as
 * inline attachments on every email (see EmailService.send) instead of
 * linking to the storefront's hosted URL — renders correctly even before
 * the site has a live public domain, and doesn't depend on it staying up.
 *
 * Only list an id here if some template actually renders it via `cid:` —
 * an attachment with no matching `cid:` reference in the HTML shows up in
 * the recipient's client as a plain (and confusing) file attachment instead
 * of rendering inline.
 *
 * Source PNGs live in ./assets, generated once from the storefront's SVG
 * logo/isotipo. nest-cli.json's compilerOptions.assets copies that folder
 * into dist/ on build — see Dockerfile, which only ships dist/, not the
 * rest of src/. */
export const BRAND_CID = {
  logoHeader: 'logo-header',
  isotipoFooter: 'isotipo-footer',
} as const;

interface BrandAttachment {
  filename: string;
  contentId: string;
  content: Buffer;
}

const ASSETS_DIR = join(__dirname, 'assets');

function loadAttachment(filename: string, contentId: string): BrandAttachment | undefined {
  try {
    return { filename, contentId, content: readFileSync(join(ASSETS_DIR, filename)) };
  } catch (error) {
    // Missing/uncopied asset shouldn't crash the whole app over a logo —
    // emails still send, just without inline images.
    logger.warn(`Could not load email brand asset "${filename}": ${(error as Error).message}`);
    return undefined;
  }
}

export const BRAND_ATTACHMENTS: BrandAttachment[] = [
  loadAttachment('logo-header.png', BRAND_CID.logoHeader),
  loadAttachment('isotipo-footer.png', BRAND_CID.isotipoFooter),
].filter((a): a is BrandAttachment => a !== undefined);
