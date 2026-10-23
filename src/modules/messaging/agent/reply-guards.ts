/**
 * Limits on what goes into and out of the sales assistant, applied in code
 * so they hold whatever a customer writes to it.
 */

/** A customer message is cut here before the assistant reads it: enough for
 * any real question, and a pasted wall of text can't fill the chat's context
 * (and its cost). WhatsApp allows 4096 characters. */
export const MAX_CUSTOMER_CHARS = 1500;
/** One message from the assistant. The instructions ask for a sentence or
 * three; this only catches one that ran away (a technical explanation fits). */
export const MAX_REPLY_CHARS = 1200;

export function truncateCustomerText(text: string, max = MAX_CUSTOMER_CHARS): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()} […mensaje recortado]` : text;
}

/** Shortens a reply at the last sentence or line that fits, so it never
 * stops mid-word. */
export function clipReply(text: string, max = MAX_REPLY_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastBreak = Math.max(
    head.lastIndexOf('\n'),
    ...['. ', '! ', '? '].map((end) => head.lastIndexOf(end) + 1),
  );
  if (lastBreak > max / 2) return head.slice(0, lastBreak).trimEnd();
  return `${head.slice(0, head.lastIndexOf(' ')).trimEnd()}…`;
}

/** Web addresses as a chat app links them: with a scheme, with www., or a
 * bare domain on a common ending — not the domain of an e-mail address. */
const LINK_PATTERN =
  /\bhttps?:\/\/[^\s<>"'()[\]]+|(?<![@\w.-])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|io|me|co|app|xyz|site|online|store|shop|link|ly|gl|ve|ar|mx|es|us)(?:\.[a-z]{2})?\b(?:\/[^\s<>"'()[\]]*)?/gi;

/** The host a link points to, without "www.", or null when it isn't one. */
export function linkHost(link: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The hosts of every link in a text, e.g. a tool's result. */
export function linkHosts(text: string): string[] {
  return [...text.matchAll(LINK_PATTERN)]
    .map((m) => linkHost(m[0].replace(/[.,;:!?]+$/, '')))
    .filter((host): host is string => host !== null);
}

/**
 * Removes links to anywhere but the given hosts (and their subdomains). The
 * assistant only has reason to send the store's own pages and what its
 * tools returned (a payment method's page, say); any other link came from
 * somewhere it shouldn't, such as a customer talking it into sharing one.
 */
export function keepKnownLinks(
  text: string,
  allowedHosts: Iterable<string>,
): { text: string; removed: string[] } {
  const allowed = [...allowedHosts];
  const removed: string[] = [];
  const kept = text.replace(LINK_PATTERN, (match) => {
    const link = match.replace(/[.,;:!?]+$/, '');
    const host = linkHost(link);
    if (host && allowed.some((h) => host === h || host.endsWith(`.${h}`))) return match;
    removed.push(link);
    return match.slice(link.length);
  });
  if (removed.length === 0) return { text, removed };
  return {
    text: kept
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([.,;:!?])/g, '$1')
      .trim(),
    removed,
  };
}
