import { FirestoreDoc } from '../../../firebase/firestore.repository';

export type ChatChannel = 'whatsapp' | 'instagram';

export const CHAT_CHANNELS: readonly ChatChannel[] = ['whatsapp', 'instagram'];

/** Why the assistant is staying quiet in a chat. */
export type ChatPauseReason = 'human_reply' | 'handoff' | 'manual';

/** One customer on one channel. Doc id: `${channel}_${customerId}`. */
export interface ChatConversation extends FirestoreDoc {
  channel: ChatChannel;
  /** WhatsApp: the customer's wa_id (their number). Instagram: the IGSID. */
  customerId: string;
  customerName?: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastInboundAt?: Date;
  /** The newest customer message — the debounce key: only the run it
   * triggered answers, so a burst of short messages gets one reply. */
  lastInboundId?: string;
  lastReplyAt?: Date | null;
  /** The assistant answers nothing until then. Set when a person replies
   * from the phone or Instagram, when the assistant hands the chat over, or
   * by an admin; null when it's active. */
  botPausedUntil?: Date | null;
  pauseReason?: ChatPauseReason | null;
  /** Raised by a handoff, cleared when an admin resumes the assistant. */
  needsAttention?: boolean;
  /** The customer asked not to get order and quote updates here; set by an
   * admin (see CustomerUpdatesService). */
  noticesOff?: boolean;
  handoffSummary?: string | null;
  /** Lock held while a run answers this chat. */
  processingUntil?: Date | null;
  /** What the assistant has answered here lately, for its limits. */
  replyUsage?: ChatReplyUsage | null;
}

/** The assistant's replies in one chat, counted for the per-chat limits
 * (see ChatUsageService). A count belongs to the day or hour stored with it
 * and starts over in the next. */
export interface ChatReplyUsage {
  /** The store's calendar day, YYYY-MM-DD. */
  day: string;
  repliesToday: number;
  costTodayUsd: number;
  /** The UTC hour, YYYY-MM-DDTHH. */
  hour: string;
  repliesThisHour: number;
}

/** messagingUsage/{YYYY-MM-DD}: the assistant's replies and their estimated
 * cost over one store day, all chats together. */
export interface DailyChatUsage {
  day: string;
  replies: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type ChatAuthor = 'customer' | 'bot' | 'human';

export type ChatMessageKind =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'share'
  | 'products'
  | 'other';

/** Where to fetch an image the customer sent, so the assistant can see it. */
export type ChatMedia =
  { source: 'whatsapp'; mediaId: string; mimeType?: string } | { source: 'url'; url: string };

export interface ChatProductCard {
  id: string;
  name: string;
  price: number;
}

export interface ChatMessage extends FirestoreDoc {
  author: ChatAuthor;
  kind: ChatMessageKind;
  /** What the assistant reads: the text, the caption, or a description of
   * what was sent (a voice note, a location…). */
  text: string;
  /** When we stored it: what the chat is ordered by. Meta's own timestamps
   * have whole seconds, too coarse for messages sent in a burst. */
  at: Date;
  /** Meta's timestamp, for messages that came through the webhook. */
  sentAt?: Date;
  /** Meta's id for it (wamid or mid). */
  externalId?: string | null;
  media?: ChatMedia | null;
  /** Product cards the assistant sent. */
  products?: ChatProductCard[] | null;
  /** Customer messages: a reply already covered it. */
  answered?: boolean;
}

export type ChatModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
export const CHAT_MODELS: readonly ChatModel[] = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];

export type ChatEffort = 'low' | 'medium' | 'high';
export const CHAT_EFFORTS: readonly ChatEffort[] = ['low', 'medium', 'high'];

/** settings/messaging */
export interface MessagingSettings {
  /** Off until an admin turns it on: the assistant answers nothing. */
  botEnabled: boolean;
  whatsappEnabled: boolean;
  instagramEnabled: boolean;
  model: ChatModel;
  effort: ChatEffort;
  /** How long the assistant stays quiet after a person answers a chat. */
  humanPauseHours: number;
  /** Extra guidance from the store (promotions, policies), appended to the
   * assistant's instructions. */
  extraInstructions: string;
  /** WhatsApp numbers (country code and digits, e.g. 584141234567) the
   * panel's alerts go to (see AdminAlertsService). The assistant doesn't
   * answer them. */
  alertPhones: string[];
  /** Order and quote updates to customers who agreed at checkout (see
   * CustomerUpdatesService). Off until the store's own number is connected:
   * the test number only reaches its few registered recipients. */
  customerUpdatesEnabled: boolean;
  /** The most the assistant may spend in a store day, all chats together, in
   * US dollars (estimated from the tokens; see model-pricing.ts). Once it's
   * reached, new messages go to a person until the next day. */
  dailyBudgetUsd: number;
  /** The most replies one chat gets in an hour and in a day. Past either,
   * the chat goes to a person: a sale takes a handful, so a chat running
   * past these is someone flooding it or the assistant going in circles. */
  chatRepliesPerHour: number;
  chatRepliesPerDay: number;
}

export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  botEnabled: false,
  whatsappEnabled: true,
  instagramEnabled: true,
  model: 'claude-haiku-5-5',
  effort: 'low',
  humanPauseHours: 12,
  extraInstructions: '',
  alertPhones: [],
  customerUpdatesEnabled: false,
  dailyBudgetUsd: 5,
  chatRepliesPerHour: 20,
  chatRepliesPerDay: 60,
};

export function conversationId(channel: ChatChannel, customerId: string): string {
  return `${channel}_${customerId}`;
}
