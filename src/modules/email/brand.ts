/**
 * Storefront look, translated to what email clients can render. The source
 * of truth is frontend/src/styles.css (OKLCH tokens, converted here to the
 * hex values a browser actually paints — the hex comments in that file are
 * approximations, these are computed) plus frontend/src/lib/contact-info.ts.
 * Backend and frontend are separate TS projects, so these are mirrored, not
 * imported; brand.spec.ts fails if the contact details drift apart.
 */
export const EMAIL_COLORS = {
  /** --brand-blue: header, footer, primary buttons, eyebrow labels. */
  blue: '#003891',
  /** --brand-navy: headings and body text on white. */
  navy: '#091e40',
  /** --brand-yellow: accent rule, footer column titles, links on blue. */
  yellow: '#f7b828',
  /** --background: the page behind the cards. */
  surface: '#f3f5f8',
  /** --border */
  border: '#d7dfe8',
  /** --muted-foreground */
  muted: '#596475',
  white: '#ffffff',
  /** text-white/70, /60 and the white/10 divider, flattened onto brand blue
   * (email clients don't reliably support rgba). */
  onBlueSoft: '#b3c3de',
  onBlueFaint: '#99afd3',
  onBlueLine: '#1a4c9c',
  /** Status badges — same pairs as order-stepper.tsx's ORDER_STATUS_BADGE. */
  badge: {
    info: { bg: '#e6ebf4', fg: '#003891' }, // bg-brand-blue/10 text-brand-blue
    pending: { bg: '#fdedc9', fg: '#091e40' }, // bg-brand-yellow/25 text-brand-navy
    success: { bg: '#d1fae5', fg: '#047857' }, // emerald-100 / emerald-700
    // bg-destructive/10; text is a deeper red than the site's
    // text-destructive (#e62c2c, ~3.7:1 on this tint) so 12px bold text
    // stays legible.
    danger: { bg: '#fdeaea', fg: '#c41f1f' },
  },
} as const;

/** Geomini loads where the client supports web fonts (Apple Mail, iOS Mail,
 * Samsung Mail, Outlook for Mac); Gmail and Outlook for Windows ignore
 * @font-face and use the first installed geometric sans below. */
export const EMAIL_FONT_STACK =
  "'Geomini','Avenir Next','Century Gothic','Trebuchet MS',Arial,Helvetica,sans-serif";

/** Same file the storefront serves (frontend/public/fonts). */
export const emailFontUrl = (siteUrl: string): string =>
  `${siteUrl}/fonts/Geomini-VariableFont_wght.woff2`;

/** Mirrors frontend/src/lib/contact-info.ts. */
export const EMAIL_CONTACT = {
  phone: '+58 424-555.5990',
  whatsappHref: 'https://wa.me/584245555990',
  email: 'electronplusve@gmail.com',
  hours: 'Lun–Sáb 9am–5pm',
} as const;
