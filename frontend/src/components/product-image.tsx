import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders the product photo, or a generic placeholder icon when there isn't one. */
export function ProductImage({
  src,
  alt,
  className,
  iconClassName,
  label,
}: {
  src?: string;
  alt: string;
  className?: string;
  iconClassName?: string;
  /** Optional caption under the icon — use on large placeholders where a bare icon looks unfinished. */
  label?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "grid place-items-center gap-2 bg-brand-surface text-muted-foreground/50",
          className,
        )}
      >
        <ImageOff className={cn("h-6 w-6", iconClassName)} />
        {label && <span className="text-xs font-medium text-muted-foreground/70">{label}</span>}
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
