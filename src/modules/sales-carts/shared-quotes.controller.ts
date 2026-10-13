import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { quoteNumberLabel } from './sales-quote-pdf';
import { SalesCartsService } from './sales-carts.service';

/** The customer's side of a shared sales cart: public, read-only, found
 * only by its unguessable token. */
@ApiTags('shared-quotes')
@Controller('shared-quotes')
export class SharedQuotesController {
  constructor(private readonly salesCarts: SalesCartsService) {}

  @Get(':token')
  findOne(@Param('token') token: string) {
    return this.salesCarts.findSharedQuote(token);
  }

  /** The quote as a PDF — what "Imprimir" opens. Re-sharing changes it, so
   * it isn't cached; building one costs a little CPU, hence the limit. */
  @Get(':token/pdf')
  @Header('Cache-Control', 'no-cache')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async pdf(@Param('token') token: string): Promise<StreamableFile> {
    const { number, pdf } = await this.salesCarts.sharedQuotePdf(token);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="Cotizacion-${quoteNumberLabel(number)}.pdf"`,
      length: pdf.length,
    });
  }
}
