import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { WhatsAppClient } from './channels/whatsapp-client';
import { CHAT_BOT_INBOUND_QUEUE } from './chat-bot.constants';
import { ChatBotController } from './chat-bot.controller';
import { ChatBotProcessor } from './chat-bot.processor';

@Module({
  imports: [BullModule.registerQueue({ name: CHAT_BOT_INBOUND_QUEUE }), ProductsModule],
  controllers: [ChatBotController],
  providers: [ChatBotProcessor, WhatsAppClient],
})
export class ChatBotModule {}
