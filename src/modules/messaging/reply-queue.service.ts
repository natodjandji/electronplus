import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { EnvConfig } from '../../config/env.validation';

/** Customers send a thought in two or three quick messages; waiting this
 * long after the latest lets one reply answer them all. */
export const REPLY_DELAY_MS = 6_000;
/** In-process mode (local dev): how often a run that found the chat busy
 * tries again, and how many times. */
const INLINE_RETRY_MS = 5_000;
const INLINE_MAX_ATTEMPTS = 12;

export interface ReplyJob {
  conversationId: string;
  /** The customer message that scheduled it — the debounce key. */
  triggerId: string;
}

/** Thrown by a run when another one holds the chat; the job is retried. */
export class ChatBusyError extends Error {
  constructor() {
    super('Chat busy');
  }
}

/**
 * Schedules each reply a few seconds out. On Cloud Run that's a Cloud Tasks
 * task calling POST /internal/messaging/reply with an OIDC token (the
 * webhook must answer Meta at once, and only a request gets CPU); the queue
 * retries a busy or failed run. Without a queue the run happens in this
 * process after the same wait. Grouped admin alerts go out the same way.
 */
@Injectable()
export class ReplyQueueService {
  private readonly logger = new Logger(ReplyQueueService.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  private inlineRunner: ((job: ReplyJob) => Promise<unknown>) | null = null;
  private alertFlushRunner: (() => Promise<unknown>) | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /** The in-process mode's worker (MessagingService.processReply). */
  setInlineRunner(runner: (job: ReplyJob) => Promise<unknown>): void {
    this.inlineRunner = runner;
  }

  /** The in-process mode's grouped alert send (AdminAlertsService.flushStock). */
  setAlertFlushRunner(runner: () => Promise<unknown>): void {
    this.alertFlushRunner = runner;
  }

  private cloudTasksTarget(path: string): {
    queue: string;
    url: string;
    email: string;
    audience: string;
  } | null {
    const queue = this.config.get('MESSAGING_TASKS_QUEUE', { infer: true });
    const email = this.config.get('SCHEDULER_INVOKER_EMAIL', { infer: true });
    const audience = this.config.get('SCHEDULER_AUDIENCE', { infer: true });
    if (!queue || !email || !audience) return null;
    const prefix = this.config.get('API_PREFIX', { infer: true });
    return {
      queue,
      email,
      audience,
      url: `${audience.replace(/\/$/, '')}/${prefix}/internal/messaging/${path}`,
    };
  }

  async schedule(job: ReplyJob, delayMs = REPLY_DELAY_MS): Promise<void> {
    const target = this.cloudTasksTarget('reply');
    if (!target) {
      this.scheduleInline(job, delayMs, 1);
      return;
    }
    // Named after the message, so a webhook Meta delivers twice can't
    // schedule two replies (Cloud Tasks refuses a repeated name).
    const id = `reply-${createHash('sha256').update(job.triggerId).digest('hex').slice(0, 40)}`;
    await this.createTask(target, id, job, new Date(Date.now() + delayMs));
  }

  /** The grouped stock alerts' send (AdminAlertsService.flushStock), at
   * `at`. Every alert of the same window asks for the same time, and so
   * the same task name: the window sends once. */
  async scheduleAlertFlush(at: Date): Promise<void> {
    const target = this.cloudTasksTarget('alerts/flush');
    if (!target) {
      setTimeout(
        () => {
          this.alertFlushRunner?.().catch((error) =>
            this.logger.error('Grouped alert send failed', error as Error),
          );
        },
        Math.max(0, at.getTime() - Date.now()),
      ).unref?.();
      return;
    }
    await this.createTask(target, `alerts-${at.getTime()}`, {}, at);
  }

  private async createTask(
    target: { queue: string; url: string; email: string; audience: string },
    id: string,
    body: object,
    at: Date,
  ): Promise<void> {
    const client = await this.auth.getClient();
    try {
      await client.request({
        url: `https://cloudtasks.googleapis.com/v2/${target.queue}/tasks`,
        method: 'POST',
        data: {
          task: {
            name: `${target.queue}/tasks/${id}`,
            scheduleTime: at.toISOString(),
            dispatchDeadline: '300s',
            httpRequest: {
              httpMethod: 'POST',
              url: target.url,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify(body)).toString('base64'),
              oidcToken: { serviceAccountEmail: target.email, audience: target.audience },
            },
          },
        },
      });
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 409) return;
      throw error;
    }
  }

  private scheduleInline(job: ReplyJob, delayMs: number, attempt: number): void {
    setTimeout(() => {
      if (!this.inlineRunner) return;
      this.inlineRunner(job).catch((error) => {
        if (error instanceof ChatBusyError && attempt < INLINE_MAX_ATTEMPTS) {
          this.scheduleInline(job, INLINE_RETRY_MS, attempt + 1);
          return;
        }
        this.logger.error(`Reply for ${job.conversationId} failed`, error as Error);
      });
    }, delayMs).unref?.();
  }
}
