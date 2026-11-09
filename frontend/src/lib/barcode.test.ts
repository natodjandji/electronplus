import { describe, expect, it } from "vitest";
import { barRuns, code128Modules } from "./barcode";

const STOP = "1100011101011";

describe("code128Modules", () => {
  it("packs an all-digit barcode in pairs (start C)", () => {
    const modules = code128Modules("6925212312018")!;
    expect(modules.startsWith("11010011100")).toBe(true);
    expect(modules.endsWith(STOP)).toBe(true);
    // Start, 6 digit pairs, a switch to B for the odd last digit, the
    // digit, the check symbol (11 modules each), then the 13-module stop.
    expect(modules).toHaveLength(11 * 10 + 13);
  });

  it("keeps letters and punctuation as written (start B)", () => {
    const modules = code128Modules("T5/9W")!;
    expect(modules.startsWith("11010010000")).toBe(true);
    expect(modules).toHaveLength(11 * 7 + 13);
  });

  it("gives a different pattern for each code", () => {
    expect(code128Modules("LED208-N")).not.toEqual(code128Modules("LED208-M"));
  });

  it("refuses what Code 128 can't hold", () => {
    expect(code128Modules("")).toBeNull();
    expect(code128Modules("Lámpara")).toBeNull();
  });
});

describe("barRuns", () => {
  it("measures each bar", () => {
    expect(barRuns("1101000111")).toEqual([
      [0, 2],
      [3, 1],
      [7, 3],
    ]);
    expect(barRuns("000")).toEqual([]);
  });
});
