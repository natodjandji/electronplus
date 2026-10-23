import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.validation';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ProductsModule } from '../products/products.module';
import { ShippingRatesModule } from '../shipping-rates/shipping-rates.module';
import { UsersModule } from '../users/users.module';
import { AdminAlertsService } from './admin-alerts.service';
import { ANTHROPIC_CLIENT, SalesAgentService } from './agent/sales-agent.service';
import { ChatStoreService } from './chat-store.service';
import { ChatUsageService } from './chat-usage.service';
import { CustomerUpdatesService } from './customer-updates.service';
import {
  MessagingAdminController,
  MessagingTasksController,
  MetaWebhookController,
} from './messaging.controller';
import { MessagingSettingsService } from './messaging-settings.service';
import { MessagingService } from './messaging.service';
import { ChatChannelsService } from './meta/chat-channels.service';
import { ReplyQueueService } from './reply-queue.service';

@Module({
  imports: [
    ProductsModule,
    PaymentMethodsModule,
    ShippingRatesModule,
    ExchangeRateModule,
    OrdersModule,
    QuotesModule,
    UsersModule,
  ],
  controllers: [MetaWebhookController, MessagingTasksController, MessagingAdminController],
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      // Null until the key is set: the assistant stays off, the rest works.
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });
        return apiKey ? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 }) : null;
      },
    },
    SalesAgentService,
    ChatStoreService,
    ChatUsageService,
    ChatChannelsService,
    MessagingSettingsService,
    MessagingService,
    ReplyQueueService,
    AdminAlertsService,
    CustomerUpdatesService,
  ],
})
export class MessagingModule {}
