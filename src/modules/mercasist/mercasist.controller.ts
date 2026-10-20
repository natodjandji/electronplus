import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MercasistExportQueryDto, UpdateMercasistSettingsDto } from './dto/mercasist.dto';
import { MercasistErrorFilter } from './mercasist-error.filter';
import { MercasistSyncService } from './mercasist-sync.service';
import { MercasistService } from './mercasist.service';

const AdminOnly = () =>
  applyDecorators(ApiBearerAuth(), UseGuards(FirebaseAuthGuard, RolesGuard), Roles(Role.ADMIN));

/** The panel's Mercasist section (Mercado Libre through Mercasist), admin only. */
@ApiTags('mercasist')
@Controller('mercasist')
@UseFilters(MercasistErrorFilter)
@AdminOnly()
export class MercasistController {
  constructor(
    private readonly mercasist: MercasistService,
    private readonly sync: MercasistSyncService,
  ) {}

  @Get('status')
  status() {
    return this.mercasist.status();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateMercasistSettingsDto) {
    return this.mercasist.updateSettings(dto);
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.mercasist.testConnection();
  }

  /** What a run would change, without changing anything on Mercasist. */
  @Post('preview')
  @HttpCode(200)
  preview() {
    return this.sync.run({ dryRun: true });
  }

  @Post('sync')
  @HttpCode(200)
  async runSync() {
    if (!(await this.sync.readSettings()).enabled) {
      throw new BadRequestException('Activa la sincronización antes de ejecutarla.');
    }
    return this.sync.run();
  }

  @Get('publications')
  publications() {
    return this.mercasist.publications();
  }

  @Get('export/summary')
  exportSummary() {
    return this.mercasist.exportSummary();
  }

  @Get('export')
  async export(@Query() query: MercasistExportQueryDto, @Res() res: Response) {
    const file = await this.mercasist.exportXlsx(query.lote, query.tamano);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(file.buffer);
  }

  @Get('sales')
  sales() {
    return this.mercasist.sales();
  }
}
