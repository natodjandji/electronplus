export const TAX_ID_PREFIXES = [
  { value: "V", label: "V — Venezolano" },
  { value: "E", label: "E — Extranjero" },
  { value: "J", label: "J — Jurídico (empresa)" },
  { value: "G", label: "G — Gobierno" },
  { value: "P", label: "P — Pasaporte" },
] as const;

export type TaxIdPrefix = (typeof TAX_ID_PREFIXES)[number]["value"];

// SENIAT check-digit algorithm for RIF numbers (J/G — legal entities).
const RIF_PREFIX_WEIGHT: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 };
const RIF_DIGIT_WEIGHTS = [4, 3, 2, 7, 6, 5, 4, 3, 2];

function rifCheckDigit(prefix: string, body8: string): number {
  const values = [RIF_PREFIX_WEIGHT[prefix], ...body8.split("").map(Number)];
  const sum = values.reduce((acc, v, i) => acc + v * RIF_DIGIT_WEIGHTS[i], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return 0;
  return remainder;
}

export interface TaxIdValidation {
  valid: boolean;
  message?: string;
}

/** `rawNumber` is whatever the user typed in the number field (digits/letters, no prefix). */
export function validateTaxIdNumber(prefix: TaxIdPrefix, rawNumber: string): TaxIdValidation {
  const value = rawNumber.trim();
  if (!value) return { valid: true };

  if (prefix === "P") {
    return value.length >= 5
      ? { valid: true }
      : { valid: false, message: "El número de pasaporte parece muy corto." };
  }

  if (prefix === "V" || prefix === "E") {
    if (!/^\d+$/.test(value)) return { valid: false, message: "Solo dígitos." };
    if (value.length < 6 || value.length > 9) {
      return { valid: false, message: "Debe tener entre 6 y 9 dígitos." };
    }
    return { valid: true };
  }

  // J / G — full RIF: 8-digit body + 1 check digit.
  const digits = value.replace(/-/g, "");
  if (!/^\d{9}$/.test(digits)) {
    return {
      valid: false,
      message: "Debe tener 8 dígitos más el dígito verificador (9 en total).",
    };
  }
  const body = digits.slice(0, 8);
  const check = Number(digits[8]);
  if (rifCheckDigit(prefix, body) !== check) {
    return { valid: false, message: "El dígito verificador no coincide con este número." };
  }
  return { valid: true };
}

export function formatTaxId(prefix: TaxIdPrefix, rawNumber: string): string | undefined {
  const value = rawNumber.trim();
  if (!value) return undefined;
  return `${prefix}-${value}`;
}
