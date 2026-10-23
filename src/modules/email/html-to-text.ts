/** Marks where one table cell ends and the next begins, until lines are
 * known: a cell after a line break starts its own line, one mid-line reads
 * as "label: value". */
const CELL = '\u0000';

/**
 * The plain-text part sent with every email's HTML (see EmailService). Mail
 * with only an HTML part looks like a bulk mailing to Gmail's classifier,
 * and some clients and screen readers show the text part instead.
 *
 * Written for the markup the templates here produce — layout tables, links
 * as buttons, escaped user text — not as a general HTML converter. Elements
 * marked data-skip-text (the hidden preview line, the review's empty stars)
 * stay out; images become their alt text; links keep their URL.
 */
export function htmlToText(html: string): string {
  const flat = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\w+)\b[^>]*\sdata-skip-text\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Source indentation isn't content; line breaks come from the tags below.
    .replace(/\s+/g, ' ')
    .replace(/<img\b[^>]*\salt="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) =>
      linkText(href, label.replace(/<[^>]*>/g, '').trim()),
    )
    .replace(/<\/td>\s*<td\b[^>]*>/gi, CELL)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|tr)>/gi, '\n')
    .replace(/<\/(?:p|h[1-6]|table)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');

  // Entities are decoded last, once: what they spell out (a customer's
  // "<b>", a "&" in a URL) is text by now, not markup.
  return decodeEntities(flat)
    .split('\n')
    .map((line) =>
      line
        .replace(/[  ]+/g, ' ')
        .trim()
        .replace(new RegExp(`^${CELL}+|${CELL}+$`, 'g'), '')
        .replace(new RegExp(` ?${CELL} ?`, 'g'), ': ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Ver mis pedidos (https://…)"; a mailto or a bare URL is just its text. */
function linkText(href: string, label: string): string {
  if (!label || label === href) return href;
  if (href.startsWith('mailto:')) return label;
  return `${label} (${href})`;
}

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name]);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};
