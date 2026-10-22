/** Mobile lines only: these numbers are for reaching people on WhatsApp,
 * which a landline can't receive. */
export const PHONE_PREFIXES = [
  { value: "0412", label: "0412" },
  { value: "0414", label: "0414" },
  { value: "0416", label: "0416" },
  { value: "0424", label: "0424" },
  { value: "0426", label: "0426" },
] as const;

export type PhonePrefix = (typeof PHONE_PREFIXES)[number]["value"];

export interface PhoneValidation {
  valid: boolean;
  message?: string;
}

export function validatePhoneNumber(rawNumber: string): PhoneValidation {
  const value = rawNumber.trim();
  if (!value) return { valid: true };
  if (!/^\d+$/.test(value)) return { valid: false, message: "Solo dígitos." };
  if (value.length !== 7)
    return { valid: false, message: "Deben ser 7 dígitos después del código." };
  return { valid: true };
}

export function formatPhone(prefix: PhonePrefix, rawNumber: string): string | undefined {
  const value = rawNumber.trim();
  if (!value) return undefined;
  return `${prefix}-${value}`;
}

/** Splits a stored "0414-1234567" value back into prefix + number for the field. */
export function parsePhone(value: string | undefined): { prefix: PhonePrefix; number: string } {
  if (!value) return { prefix: "0412", number: "" };
  const [prefix, ...rest] = value.split("-");
  if (PHONE_PREFIXES.some((p) => p.value === prefix)) {
    return { prefix: prefix as PhonePrefix, number: rest.join("-") };
  }
  return { prefix: "0412", number: "" };
}
