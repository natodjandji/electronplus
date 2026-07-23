import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TAX_ID_PREFIXES, validateTaxIdNumber, type TaxIdPrefix } from "@/lib/venezuelan-tax-id";

export function TaxIdField({
  prefix,
  onPrefixChange,
  number,
  onNumberChange,
  label = "RIF / Cédula (opcional)",
}: {
  prefix: TaxIdPrefix;
  onPrefixChange: (prefix: TaxIdPrefix) => void;
  number: string;
  onNumberChange: (number: string) => void;
  label?: string;
}) {
  const validation = validateTaxIdNumber(prefix, number);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-brand-navy">{label}</Label>
      <div className="flex gap-2">
        <Select value={prefix} onValueChange={(v) => onPrefixChange(v as TaxIdPrefix)}>
          <SelectTrigger className="w-20 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_ID_PREFIXES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="00000000"
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          aria-invalid={!validation.valid}
        />
      </div>
      {!validation.valid && <p className="text-xs text-destructive">{validation.message}</p>}
    </div>
  );
}
