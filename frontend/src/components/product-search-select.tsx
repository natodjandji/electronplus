import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** A Select can't search, and thousands of options (the full Profit Plus
 * catalog) make it freeze on open — the search box narrows the list and only
 * this many are rendered. */
const MAX_OPTIONS = 50;

interface PickableProduct {
  id: string;
  name: string;
  sku: string;
}

export function ProductSearchSelect<T extends PickableProduct>({
  inputId,
  label,
  products,
  value,
  onValueChange,
  renderOption,
  emptyHint,
  className,
}: {
  inputId: string;
  label: string;
  products: T[];
  value: string;
  onValueChange: (id: string) => void;
  renderOption: (product: T) => ReactNode;
  /** Shown when there's nothing to pick from at all (pass it only once the
   * list has loaded). */
  emptyHint?: ReactNode;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(needle))
        : products,
    [products, needle],
  );
  const options = matches.slice(0, MAX_OPTIONS);
  // The chosen product stays selectable after the search changes under it.
  const selected = value ? products.find((p) => p.id === value) : undefined;
  if (selected && !options.includes(selected)) options.unshift(selected);

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={inputId} className="text-xs font-medium text-brand-navy">
        {label}
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          placeholder="Buscar por nombre o código…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={products.length === 0}
          className="pl-9"
        />
      </div>
      <Select value={value} onValueChange={onValueChange} disabled={options.length === 0}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Seleccionar producto…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {renderOption(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {products.length === 0 && emptyHint && (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}
      {needle && products.length > 0 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Ningún producto coincide con “{query.trim()}”.
        </p>
      )}
      {matches.length > MAX_OPTIONS && (
        <p className="text-xs text-muted-foreground">
          Mostrando {MAX_OPTIONS} de {matches.length}. Escribe para encontrar el que buscas.
        </p>
      )}
    </div>
  );
}
