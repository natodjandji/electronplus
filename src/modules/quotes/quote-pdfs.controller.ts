import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { QuotePdfService } from './quote-pdf.service';

/** A customer quote's PDF, public by the unguessable link its owner (or an
 * admin) got from POST /quotes/:id/pdf-link. */
@ApiTags('quotes')
@Controller('quote-pdfs')
export class QuotePdfsController {
  constructor(private readonly quotePdf: QuotePdfService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-cache')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async pdf(@Param('token') token: string): Promise<StreamableFile> {
    const { label, pdf } = await this.quotePdf.pdfByToken(token);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="Cotizacion-${label}.pdf"`,
      length: pdf.length,
    });
  }
}
