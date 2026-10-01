import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { EnvConfig } from '../../config/env.validation';
import { CHAT_BOT_INBOUND_QUEUE } from './chat-bot.constants';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Unauthenticated by design, same as ClientErrorsController — Meta calls
 * this directly, with no Firebase session to attach. Authenticity instead
 * comes from the GET handshake's verify token (once, at subscription time)
 * and the POST's per-request X-Hub-Signature-256 HMAC check below.
 */
@ApiTags('chat-bot')
@Controller('chat-bot/webhook')
export class ChatBotController {
  private readonly logger = new Logger(ChatBotController.name);

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(CHAT_BOT_INBOUND_QUEUE) private readonly queue: Queue,
  ) {}

  /** Meta's one-time webhook subscription handshake. */
  @Get()
  verify(@Query() query: Record<string, string>, @Res() res: Response): void {
    const verifyToken = this.config.get('META_VERIFY_TOKEN', { infer: true });
    const challenge = query['hub.challenge'];
    if (
      verifyToken &&
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === verifyToken
    ) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  }

  /**
   * Must respond fast (Meta retries/eventually drops a slow or failing
   * webhook) — so this only verifies the signature and enqueues the job;
   * ChatBotProcessor does the actual intent matching and reply.
   */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    const appSecret = this.config.get('META_APP_SECRET', { infer: true });
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'];
      if (
        !req.rawBody ||
        typeof signature !== 'string' ||
        !this.isValidSignature(req.rawBody, signature, appSecret)
      ) {
        throw new ForbiddenException('Invalid signature');
      }
    } else {
      this.logger.warn(
        'META_APP_SECRET not set — accepting webhook calls without signature verification',
      );
    }

    await this.queue.add('inbound', body, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    });
    return { status: 'ok' };
  }

  private isValidSignature(rawBody: Buffer, signatureHeader: string, appSecret: string): boolean {
    if (!signatureHeader.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = signatureHeader.slice('sha256='.length);
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  }
}
