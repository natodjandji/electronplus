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
  /** The customer asked not to get order and quote updates on WhatsApp. */
  noticesOff?: boolean;
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
  /** WhatsApp numbers the panel's alerts go to: country code and digits. */
  alertPhones: string[];
  /** Order and quote updates to customers who agreed at checkout. */
  customerUpdatesEnabled: boolean;
  /** Most the assistant may spend in a day, all chats, in US dollars. */
  dailyBudgetUsd: number;
  /** Most replies one chat gets in an hour and in a day; past either a
   * person takes the chat. */
  chatRepliesPerHour: number;
  chatRepliesPerDay: number;
}

/** The assistant's replies and estimated spend today (the store's day). */
export interface MessagingUsage {
  day: string;
  replies: number;
  costUsd: number;
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
  // Per reply, from the store's own chats on Claude's list prices.
  {
    value: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    hint: "El más capaz · unos US$ 0,02 por respuesta",
  },
  {
    value: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    hint: "Equilibrado · unos US$ 0,01 por respuesta",
  },
  {
    value: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    hint: "El más rápido y económico · menos de US$ 0,001 por respuesta",
  },
];

/** "US$ 1,25"; a spend under a cent reads as such instead of "US$ 0,00". */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "menos de US$ 0,01";
  return `US$ ${amount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

/** The alert numbers as typed: comma or line separated, with or without
 * "+", spaces or dashes. A Venezuelan mobile written locally (0414… or
 * 414…) gets its 58. What isn't a number with country code comes back as
 * invalid. */
export function parseAlertPhones(text: string): { phones: string[]; invalid: string[] } {
  const phones: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    let digits = entry.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("04")) digits = `58${digits.slice(1)}`;
    else if (digits.length === 10 && digits.startsWith("4")) digits = `58${digits}`;
    if (/^[1-9]\d{9,14}$/.test(digits)) {
      if (!phones.includes(digits)) phones.push(digits);
    } else {
      invalid.push(entry);
    }
  }
  return { phones, invalid };
}

export function formatAlertPhones(phones: string[]): string {
  return phones.map((p) => `+${p}`).join(", ");
}
