import { describe, expect, it } from "vitest";
import { addressState, toDraft, toProfileUpdate } from "./profile-form";

const ACCOUNT = {
  id: "u1",
  email: "ana@example.com",
  role: "client" as const,
  displayName: "Ana Pérez",
  phone: "0414-1234567",
  whatsappUpdates: false,
  taxId: "V-12345678",
  state: "Miranda",
  city: "Chacao",
  address: "Calle Sucre, edif. Leandro",
};

describe("profile form", () => {
  it("loads the saved profile into the fields and saves it back unchanged", () => {
    const draft = toDraft(ACCOUNT);
    expect(draft).toMatchObject({
      phonePrefix: "0414",
      phoneNumber: "1234567",
      taxIdPrefix: "V",
      taxIdNumber: "12345678",
      whatsappUpdates: false,
    });
    const { displayName, phone, taxId, whatsappUpdates, state, city, address } = ACCOUNT;
    expect(toProfileUpdate(draft)).toEqual({
      displayName,
      phone,
      taxId,
      whatsappUpdates,
      state,
      city,
      address,
    });
  });

  it("starts an empty profile with WhatsApp updates on, like the checkout", () => {
    const draft = toDraft({ id: "u2", email: "b@example.com", role: "client" });
    expect(draft.whatsappUpdates).toBe(true);
    expect(addressState(draft)).toBe("empty");
  });

  it("clears the fields the customer emptied", () => {
    const draft = { ...toDraft(ACCOUNT), phoneNumber: "", taxIdNumber: "  " };
    const update = toProfileUpdate({ ...draft, state: "", city: "", address: "" });
    expect(update).toMatchObject({ phone: "", taxId: "", state: "", city: "", address: "" });
  });

  it("asks for the whole address or none of it", () => {
    const draft = toDraft(ACCOUNT);
    expect(addressState(draft)).toBe("complete");
    expect(addressState({ ...draft, address: "   " })).toBe("partial");
    expect(addressState({ ...draft, state: "", city: "", address: "" })).toBe("empty");
  });
});
