import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SchedulerAuthGuard } from '../../common/guards/scheduler-auth.guard';
import {
  ReplyJobDto,
  UpdateConversationDto,
  UpdateMessagingSettingsDto,
} from './dto/messaging.dto';
import { AdminAlertsService } from './admin-alerts.service';
import { MessagingService } from './messaging.service';
import { ChatBusyError } from './reply-queue.service';

/** The body as Meta sent it, kept by main.ts for the signature check. */
export type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Meta's webhook for WhatsApp and Instagram. Public (Meta calls it), so
 * every POST must carry Meta's signature; it answers as soon as the
 * messages are stored, and the replies run from the queue.
 */
@ApiExcludeController()
@Controller('messaging/webhook')
@SkipThrottle()
export class MetaWebhookController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const answer = this.messaging.verifySubscription(mode, token, challenge);
    if (answer === null) throw new ForbiddenException();
    return answer;
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ ok: true }> {
    if (!this.messaging.isAuthentic(req.rawBody, signature)) throw new ForbiddenException();
    await this.messaging.handleWebhook(req.body);
    return { ok: true };
  }
}

/** Cloud Tasks runs each scheduled reply here (see ReplyQueueService). */
@ApiExcludeController()
@Controller('internal/messaging')
@UseGuards(SchedulerAuthGuard)
@SkipThrottle()
export class MessagingTasksController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AdminAlertsService,
  ) {}

  @Post('reply')
  @HttpCode(200)
  async reply(@Body() job: ReplyJobDto) {
    try {
      return { outcome: await this.messaging.processReply(job) };
    } catch (error) {
      // Another run is answering this chat: 503 makes Cloud Tasks retry.
      if (error instanceof ChatBusyError) throw new ServiceUnavailableException('Chat busy');
      throw error;
    }
  }

  /** The grouped stock alerts' send (see AdminAlertsService). */
  @Post('alerts/flush')
  @HttpCode(200)
  async flushAlerts() {
    return { alerts: await this.alerts.flushStock() };
  }
}

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('admin/messaging')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MessagingAdminController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly alerts: AdminAlertsService,
  ) {}

  @Get('conversations')
  conversations() {
    return this.messaging.listConversations();
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string) {
    return this.messaging.conversationMessages(id);
  }

  @Patch('conversations/:id')
  @HttpCode(204)
  async update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    if (dto.paused !== undefined) await this.messaging.setPaused(id, dto.paused);
    if (dto.noticesOff !== undefined) await this.messaging.setNoticesOff(id, dto.noticesOff);
  }

  @Get('settings')
  async settings() {
    return { settings: await this.messaging.getSettings(), status: this.messaging.status() };
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateMessagingSettingsDto) {
    return { settings: await this.messaging.updateSettings(dto), status: this.messaging.status() };
  }

  /** A test alert to the saved alert numbers, with Meta's error for each
   * that didn't get it. */
  @Post('alerts/test')
  @HttpCode(200)
  testAlert() {
    return this.alerts.sendTest();
  }
}
