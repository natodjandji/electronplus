import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AddQuoteLineDto } from './dto/add-quote-line.dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { RejectQuoteDto } from './dto/reject-quote.dto';
import { SetGlobalDiscountDto } from './dto/set-global-discount.dto';
import { UpdateQuoteLineDto } from './dto/update-quote-line.dto';
import { computeQuoteTotals } from './quote-totals';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller('quotes')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(user, dto);
  }

  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.findMine(user);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.quotesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const quote = await this.quotesService.findOneForUser(id, user);
    return { ...quote, totals: computeQuoteTotals(quote) };
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.remove(id, user);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: AddQuoteLineDto) {
    return this.quotesService.addLine(id, user, dto);
  }

  @Patch(':id/lines/:lineId')
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateQuoteLineDto,
  ) {
    return this.quotesService.updateLine(id, lineId, user, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.removeLine(id, lineId, user);
  }

  @Patch(':id/discount')
  @Roles(Role.ADMIN)
  setGlobalDiscount(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetGlobalDiscountDto,
  ) {
    return this.quotesService.setGlobalDiscount(id, user, dto.globalDiscountPct);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.send(id, user);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotesService.approve(id, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RejectQuoteDto) {
    return this.quotesService.reject(id, user, dto.reason);
  }
}
