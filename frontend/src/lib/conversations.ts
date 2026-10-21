export type ChatChannel = "whatsapp" | "instagram";
export type ChatModel = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type ChatEffort = "low" | "medium" | "high";

export interface ChatConversation {
  id: string;
  channel: ChatChannel;
  customerId: string;
  customerName?: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  botPausedUntil?: string | null;
  pauseReason?: "human_reply" | "handoff" | "manual" | null;
  needsAttention?: boolean;
  handoffSummary?: string | null;
}

export interface ChatMessage {
  id: string;
  author: "customer" | "bot" | "human";
  kind: string;
  text: string;
  at: string;
  products?: { id: string; name: string; price: number }[] | null;
}

export interface MessagingSettings {
  botEnabled: boolean;
  whatsappEnabled: boolean;
  instagramEnabled: boolean;
  model: ChatModel;
  effort: ChatEffort;
  humanPauseHours: number;
  extraInstructions: string;
}

/** Which parts the server has credentials for. */
export interface MessagingStatus {
  assistant: boolean;
  whatsapp: boolean;
  instagram: boolean;
  webhook: boolean;
}

export const conversationsKey = ["admin", "messaging", "conversations"] as const;
export const messagingSettingsKey = ["admin", "messaging", "settings"] as const;

export const MODEL_OPTIONS: { value: ChatModel; label: string; hint: string }[] = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "El más capaz" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Equilibrado" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "El más rápido y económico" },
];

export const EFFORT_OPTIONS: { value: ChatEffort; label: string }[] = [
  { value: "low", label: "Rápida" },
  { value: "medium", label: "Normal" },
  { value: "high", label: "Detallada" },
];

export function isPaused(c: Pick<ChatConversation, "botPausedUntil">, now = Date.now()): boolean {
  return Boolean(c.botPausedUntil && new Date(c.botPausedUntil).getTime() > now);
}

export function customerLabel(
  c: Pick<ChatConversation, "channel" | "customerId" | "customerName">,
) {
  if (c.customerName) return c.customerName;
  return c.channel === "whatsapp" ? `+${c.customerId}` : "Cliente de Instagram";
}

/** Opens the chat in WhatsApp (the business app on the phone or WhatsApp Web). */
export function whatsappChatHref(customerId: string): string {
  return `https://wa.me/${customerId.replace(/\D/g, "")}`;
}
