import { Module } from '@nestjs/common';
import { ErpSyncModule } from '../erp-sync/erp-sync.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { FinanceModule } from '../finance/finance.module';
import { MercasistModule } from '../mercasist/mercasist.module';
import { ReportsModule } from '../reports/reports.module';
import { SecondStoreModule } from '../second-store/second-store.module';
import { CronController } from './cron.controller';

@Module({
  imports: [
    ErpSyncModule,
    SecondStoreModule,
    ReportsModule,
    ExpensesModule,
    FinanceModule,
    MercasistModule,
  ],
  controllers: [CronController],
})
export class CronModule {}
