/**
 * Shared interaction styling for clickable product/collection cards, so the
 * hover, focus and image zoom behave identically everywhere they appear.
 * Plain class strings (not a component) because the cards differ in markup;
 * Tailwind picks them up from this file like any other source.
 *
 * Motion: explicit properties instead of `transition-all`, the shared
 * ease-snappy curve, and spatial movement (lift, zoom) gated behind
 * motion-safe so prefers-reduced-motion keeps only the color/shadow change.
 */

/** Hover lift + brand-tinted shadow, for cards in a grid. */
export const CARD_LIFT =
  "transition-[transform,box-shadow,border-color] duration-200 ease-snappy hover:border-brand-blue/40 hover:shadow-[0_8px_30px_-8px_rgba(0,56,145,0.25)] motion-safe:hover:-translate-y-1";

/** Same hover feedback without the lift, for full-width list rows. */
export const CARD_HOVER_FLAT =
  "transition-[box-shadow,border-color] duration-200 ease-snappy hover:border-brand-blue/40 hover:shadow-[0_8px_30px_-8px_rgba(0,56,145,0.25)]";

/** Slow-ish zoom of the card image while the card is hovered. */
export const CARD_IMAGE_ZOOM =
  "transition-transform duration-300 ease-snappy motion-safe:group-hover:scale-[1.04]";

/** On a card containing a stretched link: show the focus ring on the whole
 * card while its link has keyboard focus. */
export const CARD_FOCUS_RING = "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-blue";

/** A real <a> whose ::after covers its positioned card, making the whole
 * card clickable (and open-in-new-tab-able, crawlable, prefetchable) while
 * buttons inside the card stay separately clickable above it (z-10). */
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
