import { describe, expect, it } from "vitest";
import { formatAlertPhones, parseAlertPhones } from "./conversations";

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
