import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { EnvConfig } from '../../config/env.validation';
import { QueryProductsDto } from '../products/dto/query-products.dto';
import { ProductsService } from '../products/products.service';
import { WhatsAppClient } from './channels/whatsapp-client';
import { CHAT_BOT_INBOUND_QUEUE } from './chat-bot.constants';
import { CHATBOT_ESCALATION_EVENT } from './chat-bot.events';
import { buildReply } from './intent-matcher';
import { extractIncomingTextMessages, IncomingTextMessage } from './webhook-parser';

@Processor(CHAT_BOT_INBOUND_QUEUE)
export class ChatBotProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatBotProcessor.name);

  constructor(
    private readonly productsService: ProductsService,
    private readonly whatsapp: WhatsAppClient,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const messages = extractIncomingTextMessages(job.data);
    for (const message of messages) {
      await this.handleMessage(message);
    }
  }

  private async handleMessage(message: IncomingTextMessage): Promise<void> {
    const siteUrl = this.config.get('PUBLIC_SITE_URL', { infer: true });
    const reply = await buildReply(message.text, {
      siteUrl,
      searchProducts: async (query) => {
        const { data } = await this.productsService.findAll(
          Object.assign(new QueryProductsDto(), { search: query, page: 1, limit: 3 }),
        );
        return data.map((p) => ({
          name: p.name,
          retailPrice: p.retailPrice,
          stock: p.stock,
          thumbnailUrl: p.thumbnailUrl ?? p.imageUrl,
        }));
      },
    });

    if (reply.imageUrl) {
      await this.whatsapp.sendImage(message.from, reply.imageUrl, reply.text);
    } else {
      await this.whatsapp.sendText(message.from, reply.text);
    }

    if (reply.escalate) {
      this.events.emit(CHATBOT_ESCALATION_EVENT, {
        channel: 'whatsapp',
        from: message.from,
        contactName: message.contactName,
        message: message.text,
      });
    }
  }
}
