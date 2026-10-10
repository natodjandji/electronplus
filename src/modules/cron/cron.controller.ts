import {
  Controller,
  HttpCode,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SchedulerAuthGuard } from '../../common/guards/scheduler-auth.guard';
import { ErpExportService } from '../erp-sync/erp-export.service';
import { SyncService } from '../erp-sync/sync.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FinanceService } from '../finance/finance.service';
import { ReportsService } from '../reports/reports.service';
import { SecondStoreSyncService } from '../second-store/second-store-sync.service';

/**
 * Entry points for Cloud Scheduler — one job per endpoint, schedules set on
 * the jobs themselves (see SCHEDULER_INVOKER_EMAIL in env.validation.ts).
 * Each awaits its work before answering: Cloud Run only gives the instance
 * CPU while a request is open. A failed run answers 5xx so it shows as
 * failed in Cloud Scheduler; the next tick retries anyway.
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(SchedulerAuthGuard)
@SkipThrottle()
export class CronController {
  constructor(
    private readonly erpSync: SyncService,
    private readonly erpExport: ErpExportService,
    private readonly secondStoreSync: SecondStoreSyncService,
    private readonly reports: ReportsService,
    private readonly expenses: ExpensesService,
    private readonly finance: FinanceService,
  ) {}

  /** Retries pending sale reports, then pulls the catalog. Both go through
   * the principal bridge, so until it is set up the tick touches nothing —
   * not even the query for pending sales. */
  @Post('erp-sync')
  @HttpCode(200)
  async runErpSync() {
    if (!this.erpSync.isConfigured()) {
      return { status: 'skipped', reason: 'Bridge principal de Profit Plus no configurado' };
    }
    const exports = await this.erpExport.exportPending();
    const log = await this.erpSync.runInboundSync();
    return { status: log.status, itemsProcessed: log.itemsProcessed, exports };
  }

  @Post('second-store-sync')
  @HttpCode(200)
  async runSecondStoreSync() {
    if (!this.secondStoreSync.isConfigured()) {
      return { status: 'skipped', reason: 'Bridge de la tienda secundaria no configurado' };
    }
    return { status: 'success', ...(await this.secondStoreSync.runInboundSync()) };
  }

  /** The once-a-day jobs. Each catches and logs its own errors (they were
   * written for in-process cron, where nothing awaits them) — only the
   * rollup reports a failure back, as an undefined result. */
  @Post('daily')
  @HttpCode(200)
  async runDaily() {
    const [rollup] = await Promise.all([
      this.reports.rollupYesterday(),
      this.expenses.recomputeDueStatuses(),
      this.finance.recomputeDueStatuses(),
    ]);
    if (!rollup) throw new InternalServerErrorException('Sales rollup failed — see logs');
    return { status: 'success', salesRollup: rollup.date };
  }
}
