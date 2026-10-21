import type { ChatChannel } from './entities/chat.entity';

/** The assistant handed a chat to the staff (NotificationsService alerts them). */
export const CHAT_HANDOFF_EVENT = 'chat.handoff';

export interface ChatHandoffEvent {
  conversationId: string;
  channel: ChatChannel;
  customerName: string | null;
  reason: string;
  summary: string;
}
