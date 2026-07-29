import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PHONE_PREFIXES, validatePhoneNumber, type PhonePrefix } from "@/lib/venezuelan-phone";

export function PhoneField({
  prefix,
  onPrefixChange,
  number,
  onNumberChange,
  label = "Teléfono",
}: {
  prefix: PhonePrefix;
  onPrefixChange: (prefix: PhonePrefix) => void;
  number: string;
  onNumberChange: (number: string) => void;
  label?: string;
}) {
  const validation = validatePhoneNumber(number);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-brand-navy">{label}</Label>
      <div className="flex gap-2">
        <Select value={prefix} onValueChange={(v) => onPrefixChange(v as PhonePrefix)}>
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHONE_PREFIXES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="1234567"
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          aria-invalid={!validation.valid}
        />
      </div>
      {!validation.valid && <p className="text-xs text-destructive">{validation.message}</p>}
    </div>
  );
}
