import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Renders the product photo, or a generic placeholder icon when there isn't one. */
export function ProductImage({
  src,
  alt,
  className,
  iconClassName,
}: {
  src?: string;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "grid place-items-center bg-brand-surface text-muted-foreground/50",
          className,
        )}
      >
        <ImageOff className={cn("h-6 w-6", iconClassName)} />
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
