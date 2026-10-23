import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { storeDay } from '../../common/utils/store-day';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { estimateCostUsd, type TokenUsage } from './agent/model-pricing';
import type {
  ChatConversation,
  ChatModel,
  ChatReplyUsage,
  DailyChatUsage,
  MessagingSettings,
} from './entities/chat.entity';

/** Which limit stops the assistant from answering a chat. */
export type ChatLimit = 'chat_hour' | 'chat_day' | 'daily_budget';

/** The UTC hour a moment falls in, YYYY-MM-DDTHH: the per-hour window. */
export const hourKey = (now: Date): string => now.toISOString().slice(0, 13);

const emptyDay = (day: string): DailyChatUsage => ({
  day,
  replies: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

/**
 * Keeps the sales assistant inside its limits: replies per chat per hour and
 * per day, and an estimated spend per store day across all chats. Counted
 * after each reply; checked before the next one calls Claude.
 */
@Injectable()
export class ChatUsageService {
  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {}

  private dayRef(day: string) {
    return this.firestore.collection(Collections.MESSAGING_USAGE).doc(day);
  }

  async today(now = new Date()): Promise<DailyChatUsage> {
    const day = storeDay(now);
    const snap = await this.dayRef(day).get();
    return { ...emptyDay(day), ...(snap.data() as Partial<DailyChatUsage> | undefined) };
  }

  /** The limit this chat has reached, if any. The chat's own counts come
   * with it; the day's spend is read fresh, since every chat adds to it. */
  async limitReached(
    conversation: Pick<ChatConversation, 'replyUsage'>,
    settings: Pick<
      MessagingSettings,
      'chatRepliesPerHour' | 'chatRepliesPerDay' | 'dailyBudgetUsd'
    >,
    now = new Date(),
  ): Promise<ChatLimit | null> {
    const usage = conversation.replyUsage;
    if (usage?.hour === hourKey(now) && usage.repliesThisHour >= settings.chatRepliesPerHour) {
      return 'chat_hour';
    }
    if (usage?.day === storeDay(now) && usage.repliesToday >= settings.chatRepliesPerDay) {
      return 'chat_day';
    }
    if ((await this.today(now)).costUsd >= settings.dailyBudgetUsd) return 'daily_budget';
    return null;
  }

  /** Counts one reply and its tokens, in the chat and in the day. The run
   * holds the chat's lock, so the chat's counts are written as computed;
   * the day's add up in a transaction, since chats answer in parallel. */
  async record(
    conversation: Pick<ChatConversation, 'id' | 'replyUsage'>,
    model: ChatModel,
    tokens: TokenUsage,
    now = new Date(),
  ): Promise<void> {
    const cost = estimateCostUsd(model, tokens);
    const day = storeDay(now);
    const hour = hourKey(now);
    const previous = conversation.replyUsage;
    const sameDay = previous?.day === day;
    const replyUsage: ChatReplyUsage = {
      day,
      repliesToday: (sameDay ? previous.repliesToday : 0) + 1,
      costTodayUsd: (sameDay ? previous.costTodayUsd : 0) + cost,
      hour,
      repliesThisHour: (previous?.hour === hour ? previous.repliesThisHour : 0) + 1,
    };
    await this.firestore
      .collection(Collections.CHAT_CONVERSATIONS)
      .doc(conversation.id)
      .set({ replyUsage }, { merge: true });

    const ref = this.dayRef(day);
    await this.firestore.runTransaction(async (tx) => {
      const current = {
        ...emptyDay(day),
        ...((await tx.get(ref)).data() as Partial<DailyChatUsage> | undefined),
      };
      tx.set(ref, {
        day,
        replies: current.replies + 1,
        costUsd: current.costUsd + cost,
        inputTokens: current.inputTokens + tokens.input,
        outputTokens: current.outputTokens + tokens.output,
        cacheReadTokens: current.cacheReadTokens + tokens.cacheRead,
        cacheWriteTokens: current.cacheWriteTokens + tokens.cacheWrite,
      } satisfies DailyChatUsage);
    });
  }
}
