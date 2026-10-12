import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
}
