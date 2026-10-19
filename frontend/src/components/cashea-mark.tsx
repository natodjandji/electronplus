import { cn } from "@/lib/utils";

/** Cashea's colors, as its own site and checkout SDK use them. */
export const CASHEA_YELLOW = "#FDFA3D";
export const CASHEA_BLACK = "#000000";

/**
 * Cashea's logo mark (the rounded tile with its "c"), as a vector so it's
 * sharp at any size. Normally a yellow tile with a black mark; `dark` is a
 * black tile with a white mark, for a yellow background. An empty `title`
 * hides it from screen readers.
 */
export function CasheaMark({
  dark = false,
  className,
  title = "Cashea",
}: {
  dark?: boolean;
  className?: string;
  title?: string;
}) {
  const tile = dark ? CASHEA_BLACK : CASHEA_YELLOW;
  const mark = dark ? "#FFFFFF" : CASHEA_BLACK;
  return (
    <svg
      viewBox="25 191.53 117.23 116.94"
      // Decorative next to a label that already says "Cashea".
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      className={cn("shrink-0", className)}
    >
      <path
        fill={tile}
        d="M56.36,191.53h54.51c17.32,0,31.36,14.04,31.36,31.36v54.2c0,17.32-14.04,31.36-31.36,31.36H56.36C39.04,308.47,25,294.42,25,277.1v-54.2C25,205.58,39.04,191.53,56.36,191.53z"
      />
      <path
        fill={mark}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M118.58,250.61c-0.35,18.78-15.69,33.9-34.55,33.9c-19.09,0-34.56-15.47-34.56-34.56c0-18.95,15.25-34.34,34.16-34.56v17.31c-9.34,0.22-16.85,7.86-16.85,17.25c0,9.53,7.73,17.26,17.26,17.26c9.31,0,16.89-7.37,17.24-16.59L118.58,250.61z"
      />
    </svg>
  );
}
