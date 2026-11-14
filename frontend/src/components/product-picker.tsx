import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/product-image";
import { searchProducts, type SearchableProduct } from "@/lib/product-search";
import { cn } from "@/lib/utils";

/** Results rendered at once: the full catalog can be thousands, and nobody
 * scrolls that far instead of typing another word. */
const MAX_RESULTS = 30;

export interface PickerProduct extends SearchableProduct {
  id: string;
  retailPrice: number;
  wholesalePrice: number;
  imageUrl?: string;
  thumbnailUrl?: string;
}

/**
 * A search box whose results are product cards — photo, description, SKU and
 * both prices — and picking one hands it over at once. A product
 * `unavailable` returns a reason for stays listed, greyed out, with the
 * reason.
 */
export function ProductPicker<T extends PickerProduct>({
  inputId,
  label,
  products,
  onPick,
  formatPrice,
  unavailable,
  disabled,
  emptyHint,
  className,
}: {
  inputId: string;
  label: string;
  products: T[];
  onPick: (product: T) => void;
  formatPrice: (amount: number) => string;
  unavailable?: (product: T) => string | null;
  disabled?: boolean;
  /** Shown when there's nothing to pick from at all (pass it only once the
   * list has loaded). */
  emptyHint?: string;
  className?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => searchProducts(products, query), [products, query]);
  const results = matches.slice(0, MAX_RESULTS);
  const showList = open && !disabled && products.length > 0;

  // Arrowing past the bottom of the list scrolls it along.
  useEffect(() => {
    if (showList)
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showList, active, listId]);

  const pick = (product: T) => {
    if (unavailable?.(product)) return;
    onPick(product);
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // A search box clears itself on Escape, and that edit opened the
      // list again. First Escape closes the list; a second one clears.
      e.preventDefault();
      if (showList) setOpen(false);
      else setQuery("");
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // A closed list opens on its first product, not the next one.
      if (!showList) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (results.length ? (i + step + results.length) % results.length : 0));
    } else if (e.key === "Enter" && showList && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <div className={cn("relative grid min-w-0 gap-1.5", className)}>
      <Label htmlFor={inputId} className="text-xs font-medium text-brand-navy">
        {label}
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Descripción, SKU o marca…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          disabled={disabled || products.length === 0}
          className="pl-9"
        />
      </div>

      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[min(26rem,60vh)] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ningún producto coincide con “{query.trim()}”.
            </p>
          )}
          {results.map((product, index) => {
            const reason = unavailable?.(product) ?? null;
            return (
              <div
                key={product.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={reason ? true : undefined}
                // Keeps the focus in the search box, so its blur doesn't
                // close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(product)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2",
                  reason ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  index === active && "bg-brand-surface",
                )}
              >
                <ProductImage
                  src={product.thumbnailUrl ?? product.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md border border-border"
                  iconClassName="h-4 w-4"
                />
                {/* On a phone the prices go under the name, which otherwise
                    gets squeezed to a word per line; from sm up, beside it. */}
                <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-sm font-medium leading-snug text-brand-navy">
                      {product.name}
                    </div>
                    {product.model && (
                      <div className="truncate text-xs text-muted-foreground">
                        SKU {product.model}
                      </div>
                    )}
                    {reason && <div className="text-xs text-brand-navy/70">{reason}</div>}
                  </div>
                  <dl className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums sm:mt-0 sm:grid sm:shrink-0 sm:grid-cols-[auto_auto] sm:items-baseline sm:gap-x-2 sm:text-right">
                    <div className="flex gap-1 sm:contents">
                      <dt className="text-muted-foreground">Detal</dt>
                      <dd className="font-semibold text-brand-navy">
                        {product.retailPrice > 0 ? formatPrice(product.retailPrice) : "—"}
                      </dd>
                    </div>
                    <div className="flex gap-1 sm:contents">
                      <dt className="text-muted-foreground">Mayor</dt>
                      <dd className="text-brand-navy">
                        {product.wholesalePrice > 0 ? formatPrice(product.wholesalePrice) : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })}
          {matches.length > MAX_RESULTS && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Mostrando {MAX_RESULTS} de {matches.length}. Escribe otra palabra para encontrar el
              que buscas.
            </p>
          )}
        </div>
      )}
      {products.length === 0 && emptyHint && (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}
