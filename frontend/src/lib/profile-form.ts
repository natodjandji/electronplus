import type { MyAccount } from "@/lib/my-account";
import { formatPhone, parsePhone, type PhonePrefix } from "@/lib/venezuelan-phone";
import { formatTaxId, parseTaxId, type TaxIdPrefix } from "@/lib/venezuelan-tax-id";

/** The profile form's values, as its fields hold them. */
export interface Draft {
  displayName: string;
  taxIdPrefix: TaxIdPrefix;
  taxIdNumber: string;
  phonePrefix: PhonePrefix;
  phoneNumber: string;
  whatsappUpdates: boolean;
  state: string;
  city: string;
  address: string;
}

export function toDraft(account: MyAccount): Draft {
  const taxId = parseTaxId(account.taxId);
  const phone = parsePhone(account.phone);
  return {
    displayName: account.displayName ?? "",
    taxIdPrefix: taxId.prefix,
    taxIdNumber: taxId.number,
    phonePrefix: phone.prefix,
    phoneNumber: phone.number,
    // Same default as the checkout's checkbox.
    whatsappUpdates: account.whatsappUpdates ?? true,
    state: account.state ?? "",
    city: account.city ?? "",
    address: account.address ?? "",
  };
}

/** The PATCH /users/me body. Empty strings clear what the customer emptied. */
export function toProfileUpdate(draft: Draft) {
  return {
    displayName: draft.displayName.trim(),
    taxId: formatTaxId(draft.taxIdPrefix, draft.taxIdNumber) ?? "",
    phone: formatPhone(draft.phonePrefix, draft.phoneNumber) ?? "",
    whatsappUpdates: draft.whatsappUpdates,
    state: draft.state,
    city: draft.city,
    address: draft.address.trim(),
  };
}

/** An address is the state, the city and the street, all three or none. */
export function addressState(draft: Draft): "empty" | "partial" | "complete" {
  const parts = [draft.state, draft.city, draft.address.trim()];
  if (parts.every(Boolean)) return "complete";
  return parts.some(Boolean) ? "partial" : "empty";
}
