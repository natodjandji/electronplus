export const CHATBOT_ESCALATION_EVENT = 'chatbot.escalation';

/**
 * Fired when the WhatsApp bot can't help (unrecognized message, or the
 * customer explicitly asks for a human) — unlike the website widget's
 * identical "no entendí" reply, a WhatsApp thread is a live two-way
 * channel, so this also has to actually reach a person instead of just
 * telling the customer a phone number.
 */
export interface ChatbotEscalationEvent {
  channel: 'whatsapp';
  from: string;
  contactName?: string;
  message: string;
}
