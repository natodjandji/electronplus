/**
 * Minimal, defensive parsing of Meta's WhatsApp Cloud API webhook payload —
 * typed only for the fields this bot actually reads. The real payload has
 * many more optional fields (statuses/delivery receipts, non-text message
 * types, template replies, etc.) that are deliberately ignored here rather
 * than modeled, since a stray/unexpected shape should be skipped, not throw.
 */

export interface IncomingTextMessage {
  from: string;
  text: string;
  contactName?: string;
}

export function extractIncomingTextMessages(body: unknown): IncomingTextMessage[] {
  const out: IncomingTextMessage[] = [];
  const entries = asArray(asRecord(body)?.entry);
  for (const entry of entries) {
    const changes = asArray(asRecord(entry)?.changes);
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;
      const contactsByWaId = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const c = asRecord(contact);
        const waId = typeof c?.wa_id === 'string' ? c.wa_id : undefined;
        const name =
          typeof asRecord(c?.profile)?.name === 'string'
            ? (asRecord(c?.profile)?.name as string)
            : undefined;
        if (waId && name) contactsByWaId.set(waId, name);
      }
      for (const message of asArray(value.messages)) {
        const m = asRecord(message);
        if (!m || m.type !== 'text') continue;
        const from = typeof m.from === 'string' ? m.from : undefined;
        const text =
          typeof asRecord(m.text)?.body === 'string'
            ? (asRecord(m.text)?.body as string)
            : undefined;
        if (!from || !text) continue;
        out.push({ from, text, contactName: contactsByWaId.get(from) });
      }
    }
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
