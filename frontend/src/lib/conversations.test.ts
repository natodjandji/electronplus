import { describe, expect, it } from "vitest";
import {
  customerDetail,
  customerLabel,
  formatAlertPhones,
  parseAlertPhones,
  whatsappPhone,
} from "./conversations";

const BSUID = "VE.13491208655302741918";
const whatsapp = { channel: "whatsapp" as const, customerId: "584141610929" };
const hidden = { channel: "whatsapp" as const, customerId: BSUID };

describe("whatsappPhone", () => {
  it("reads the number from the id of a chat older than customerPhone", () => {
    expect(whatsappPhone(whatsapp)).toBe("584141610929");
  });

  it("never takes a BSUID for a number", () => {
    expect(whatsappPhone(hidden)).toBeNull();
  });

  it("prefers the number the chat learned, and respects a number that's gone", () => {
    expect(whatsappPhone({ ...hidden, customerPhone: "584141610929" })).toBe("584141610929");
    expect(whatsappPhone({ ...whatsapp, customerPhone: null })).toBeNull();
  });

  it("has none for Instagram", () => {
    expect(whatsappPhone({ channel: "instagram", customerId: "12345" })).toBeNull();
  });
});

describe("customerLabel and customerDetail", () => {
  it("show the name, with the number and username under it", () => {
    const c = { ...whatsapp, customerName: "Ana", customerUsername: "ana.ve" };
    expect(customerLabel(c)).toBe("Ana");
    expect(customerDetail(c)).toBe("+584141610929 · @ana.ve");
  });

  it("show the number of a chat with no name", () => {
    expect(customerLabel(whatsapp)).toBe("+584141610929");
    expect(customerDetail(whatsapp)).toBe("");
  });

  it("never show a BSUID", () => {
    expect(customerLabel({ ...hidden, customerUsername: "ana.ve" })).toBe("@ana.ve");
    expect(customerDetail({ ...hidden, customerUsername: "ana.ve" })).toBe("");
    expect(customerLabel(hidden)).toBe("Cliente de WhatsApp");
    expect(customerDetail({ ...hidden, customerName: "Ana" })).toBe("");
  });

  it("keep Instagram as it was", () => {
    const c = { channel: "instagram" as const, customerId: "12345" };
    expect(customerLabel(c)).toBe("Cliente de Instagram");
    expect(customerDetail(c)).toBe("");
  });
});

describe("parseAlertPhones", () => {
  it("reads numbers written with +, spaces and dashes", () => {
    expect(parseAlertPhones("+58 414 1610929, +1 555-197-5075")).toEqual({
      phones: ["584141610929", "15551975075"],
      invalid: [],
    });
  });

  it("adds 58 to a Venezuelan mobile written locally", () => {
    expect(parseAlertPhones("0414-1610929, 414 1610928").phones).toEqual([
      "584141610929",
      "584141610928",
    ]);
  });

  it("keeps one of each and skips blanks", () => {
    expect(parseAlertPhones("584141610929\n\n+58 414 1610929;").phones).toEqual(["584141610929"]);
  });

  it("reports what isn't a full number", () => {
    expect(parseAlertPhones("12345, 0212").invalid).toEqual(["12345", "0212"]);
  });

  it("formats them back with +", () => {
    expect(formatAlertPhones(["584141610929"])).toBe("+584141610929");
  });
});
