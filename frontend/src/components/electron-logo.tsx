import { cn } from "@/lib/utils";

type LogoLayout = "full" | "wordmark" | "isotype";
type LogoTone = "color" | "white" | "on-amber";

/**
 * layout: "full" spells out "Electron Plus" in full (the official lockup);
 * "wordmark" is the compact "Electron+" mark; "isotype" is the icon alone.
 * tone: "color" (navy + amber) for light/white surfaces, "white" (white +
 * amber) for dark/navy surfaces (Pantone 661 C), "on-amber" (navy + white)
 * for amber/yellow surfaces (Pantone 2010 C) where an amber accent would
 * disappear into the background.
 */
const ASSET: Record<LogoLayout, Record<LogoTone, string>> = {
  full: {
    color: "/assets/brand/logo-full-color.svg",
    white: "/assets/brand/logo-full-white.svg",
    "on-amber": "/assets/brand/logo-full-on-amber.svg",
  },
  wordmark: {
    color: "/assets/brand/wordmark-color.svg",
    white: "/assets/brand/wordmark-white.svg",
    "on-amber": "/assets/brand/wordmark-on-amber.svg",
  },
  isotype: {
    color: "/assets/brand/isotipo-color.svg",
    white: "/assets/brand/isotipo-white.svg",
    "on-amber": "/assets/brand/isotipo-on-amber.svg",
  },
};

export function ElectronLogo({
  layout = "full",
  tone = "color",
  className = "h-8",
}: {
  layout?: LogoLayout;
  tone?: LogoTone;
  className?: string;
}) {
  return <img src={ASSET[layout][tone]} alt="Electron Plus" className={cn("w-auto", className)} />;
}
