import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { EmailListener } from './email.listener';
import { EmailService } from './email.service';

@Module({
  imports: [OrdersModule, UsersModule],
  providers: [EmailService, EmailListener],
  exports: [EmailService],
})
export class EmailModule {}
