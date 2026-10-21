import { Inject, Injectable } from '@nestjs/common';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../../firebase/firebase.constants';
import { Collections } from '../../firebase/firestore-collections';
import { FirestoreRepository, snapshotToEntity } from '../../firebase/firestore.repository';
import {
  conversationId,
  type ChatAuthor,
  type ChatConversation,
  type ChatMessage,
  type ChatMessageKind,
  type ChatPauseReason,
  type ChatProductCard,
} from './entities/chat.entity';
import type { EchoedChatMessage, InboundChatMessage } from './meta/webhook-events';

/** How much of a chat the assistant reads back each time. */
const HISTORY_LIMIT = 40;
const PREVIEW_LENGTH = 120;
const ADMIN_LIST_LIMIT = 100;

export interface OutboundChatMessage {
  author: Exclude<ChatAuthor, 'customer'>;
  kind: ChatMessageKind;
  text: string;
  externalIds: string[];
  products?: ChatProductCard[];
}

/** Meta's message ids double as doc ids, so a webhook Meta retries is
 * stored once. Instagram ids can contain "/", which Firestore reads as a
 * path separator. */
export function messageDocId(externalId: string): string {
  return externalId.replace(/\//g, '_');
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

/** The chats and their messages in Firestore. */
@Injectable()
export class ChatStoreService {
  private readonly conversations: FirestoreRepository<ChatConversation>;
  private lastTime = 0;

  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {
    this.conversations = new FirestoreRepository<ChatConversation>(
      firestore,
      Collections.CHAT_CONVERSATIONS,
    );
  }

  /** Now, but always later than the last message stored here: Meta delivers
   * several messages in one webhook, and they must keep their order. */
  private nextTime(): Date {
    this.lastTime = Math.max(Date.now(), this.lastTime + 1);
    return new Date(this.lastTime);
  }

  private messages(id: string) {
    return this.conversations.doc(id).collection(Collections.CHAT_MESSAGES);
  }

  findConversation(id: string): Promise<ChatConversation | null> {
    return this.conversations.findById(id);
  }

  /** Stores a customer message. False when Meta delivered it before (its
   * webhooks retry), so nothing downstream runs twice. */
  async recordInbound(
    message: InboundChatMessage,
  ): Promise<{ conversationId: string; isNew: boolean }> {
    const id = conversationId(message.channel, message.customerId);
    const at = this.nextTime();
    try {
      await this.messages(id)
        .doc(messageDocId(message.externalId))
        .create({
          author: 'customer',
          kind: message.kind,
          text: message.text,
          at,
          sentAt: message.at,
          externalId: message.externalId,
          media: message.media ?? null,
        });
    } catch (error) {
      if ((error as { code?: number }).code === 6) return { conversationId: id, isNew: false };
      throw error;
    }
    await this.conversations.doc(id).set(
      {
        channel: message.channel,
        customerId: message.customerId,
        ...(message.customerName ? { customerName: message.customerName } : {}),
        lastMessageAt: at,
        lastMessagePreview: preview(message.text, message.kind),
        lastInboundAt: at,
        lastInboundId: message.externalId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { conversationId: id, isNew: true };
  }

  /** A message the business sent from the phone or Instagram: stored as the
   * person's, and the assistant steps back for `pauseHours`. Our own sends
   * are recognized and skipped. Returns whether it paused the chat. */
  async recordHumanEcho(echo: EchoedChatMessage, pauseHours: number): Promise<boolean> {
    const id = conversationId(echo.channel, echo.customerId);
    const ref = this.messages(id).doc(messageDocId(echo.externalId));
    if ((await ref.get()).exists) return false;
    const at = this.nextTime();
    await ref.set({
      author: 'human',
      kind: 'text',
      text: echo.text,
      at,
      sentAt: echo.at,
      externalId: echo.externalId,
    });
    await this.conversations.doc(id).set(
      {
        channel: echo.channel,
        customerId: echo.customerId,
        lastMessageAt: at,
        lastMessagePreview: preview(echo.text, 'text'),
        botPausedUntil: new Date(Date.now() + pauseHours * 60 * 60 * 1000),
        pauseReason: 'human_reply',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  }

  async recordOutbound(id: string, message: OutboundChatMessage): Promise<void> {
    const at = this.nextTime();
    const [firstId] = message.externalIds;
    const ref = firstId ? this.messages(id).doc(messageDocId(firstId)) : this.messages(id).doc();
    await ref.set({
      author: message.author,
      kind: message.kind,
      text: message.text,
      at,
      externalId: firstId ?? null,
      products: message.products ?? null,
    });
    await this.conversations.patch(id, {
      lastMessageAt: at,
      lastMessagePreview: preview(message.text, message.kind),
      lastReplyAt: at,
    });
  }

  /** The newest messages, oldest first. */
  async history(id: string, limit = HISTORY_LIMIT): Promise<ChatMessage[]> {
    const snap = await this.messages(id).orderBy('at', 'desc').limit(limit).get();
    return snap.docs.map((doc) => snapshotToEntity<ChatMessage>(doc)).reverse();
  }

  async markAnswered(id: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const batch = this.firestore.batch();
    for (const messageId of messageIds) {
      batch.set(this.messages(id).doc(messageId), { answered: true }, { merge: true });
    }
    await batch.commit();
  }

  async setCustomerName(id: string, name: string): Promise<void> {
    await this.conversations.patch(id, { customerName: name });
  }

  /** Takes the chat for one run. False while another run holds it — that
   * run's task is retried later instead of two replies interleaving. */
  async tryLock(id: string, holdMs: number): Promise<boolean> {
    const ref = this.conversations.doc(id);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const until = toDate(snap.data()?.processingUntil);
      if (until && until.getTime() > Date.now()) return false;
      tx.set(ref, { processingUntil: new Date(Date.now() + holdMs) }, { merge: true });
      return true;
    });
  }

  unlock(id: string): Promise<void> {
    return this.conversations.patch(id, { processingUntil: null });
  }

  async pause(id: string, until: Date, reason: ChatPauseReason, summary?: string): Promise<void> {
    await this.conversations.patch(id, {
      botPausedUntil: until,
      pauseReason: reason,
      ...(reason === 'handoff' ? { needsAttention: true, handoffSummary: summary ?? null } : {}),
    });
  }

  async resume(id: string): Promise<void> {
    await this.conversations.patch(id, {
      botPausedUntil: null,
      pauseReason: null,
      needsAttention: false,
      handoffSummary: null,
    });
  }

  /** The admin's list, most recent first. */
  listRecent(): Promise<ChatConversation[]> {
    return this.conversations.findAll({
      orderBy: { field: 'lastMessageAt', direction: 'desc' },
      limit: ADMIN_LIST_LIMIT,
    });
  }

  /** Whether the assistant may answer now. */
  static isPaused(
    conversation: Pick<ChatConversation, 'botPausedUntil'>,
    now = Date.now(),
  ): boolean {
    const until = toDate(conversation.botPausedUntil);
    return Boolean(until && until.getTime() > now);
  }
}

const KIND_PREVIEW: Partial<Record<ChatMessageKind, string>> = {
  image: '📷 Foto',
  products: '🛒 Productos',
};

function preview(text: string, kind: ChatMessageKind): string {
  const base = text.trim() || KIND_PREVIEW[kind] || '';
  return base.length > PREVIEW_LENGTH ? `${base.slice(0, PREVIEW_LENGTH - 1)}…` : base;
}
