import { describe, expect, it } from "vitest";
import { comparePrices, isFromSecondStoreErp, rankLinkCandidates } from "./second-store";

describe("isFromSecondStoreErp", () => {
  it("treats a record as Profit Plus's unless an admin made it by hand", () => {
    expect(isFromSecondStoreErp({ source: "erp" })).toBe(true);
    // Records from before `source` existed all came from the sync.
    expect(isFromSecondStoreErp({})).toBe(true);
    expect(isFromSecondStoreErp({ source: "manual" })).toBe(false);
  });
});

describe("comparePrices", () => {
  it("agrees to the cent", () => {
    expect(comparePrices(7.4, 7.4)).toBe("same");
    expect(comparePrices(0.1 + 0.2, 0.3)).toBe("same");
    expect(comparePrices(7.4, 6.8)).toBe("different");
    expect(comparePrices(3.3, 3.31)).toBe("different");
  });

  it("doesn't count a missing price as agreeing", () => {
    expect(comparePrices(7.4, undefined)).toBe("different");
    expect(comparePrices(0, 7.4)).toBe("different");
    expect(comparePrices(0, 0)).toBe("different");
    expect(comparePrices(undefined, undefined)).toBe("different");
  });
});

describe("rankLinkCandidates", () => {
  const records = [
    { name: "PANEL LED 18W EMPOTRAR 1518", code: "9001" },
    { name: "TUBO LED T5 9W 6500K", code: "T59W" },
    { name: "VAPOLETA LED 2W", code: "1518" },
    { name: "PANEL LED 18W EMPOTRAR CUADRADO", code: "5212312018" },
    { name: "PANEL LED 3W EMPOTRABLE", code: "5212312003" },
    { name: "CONTACTOR MODULAR 125A", code: "BCH8-125A" },
    { name: "LAMPARA SIN CODIGO" },
  ];
  const ranked = (query: string, extra?: string[]) =>
    rankLinkCandidates(records, query, extra).map((c) => [c.record.code ?? "-", c.codeMatch]);

  it("puts the record with the same code first, then the ones that mention it", () => {
    expect(ranked("1518")).toEqual([
      ["1518", "exact"],
      ["9001", null],
    ]);
  });

  it("matches a code written with other punctuation or case", () => {
    expect(ranked("T5/9W")).toEqual([["T59W", "exact"]]);
    expect(ranked("t59w")).toEqual([["T59W", "exact"]]);
  });

  it("matches a barcode cut short, or a code with a letter added", () => {
    expect(ranked("6925212312018")).toEqual([["5212312018", "similar"]]);
    expect(ranked("BCH8-125")).toEqual([["BCH8-125A", "similar"]]);
  });

  it("doesn't match a short code against the start or end of a longer one", () => {
    // Still found by the text search, but none ranked as a code match.
    expect(ranked("18")).toEqual([
      ["9001", null],
      ["1518", null],
      ["5212312018", null],
    ]);
  });

  it("also looks for the extra codes, ahead of the name matches", () => {
    expect(ranked("ARON-N", ["6925212312003"])).toEqual([["5212312003", "similar"]]);
    expect(ranked("panel 18w", ["5212312018"])).toEqual([
      ["5212312018", "exact"],
      ["9001", null],
    ]);
  });

  it("finds by name, ignoring accents, in the list's order", () => {
    expect(ranked("lámpara")).toEqual([["-", null]]);
    expect(ranked("panel empotrar")).toEqual([
      ["9001", null],
      ["5212312018", null],
    ]);
  });

  it("keeps every record for an empty query", () => {
    expect(rankLinkCandidates(records, "  ", ["1518"])).toHaveLength(records.length);
  });
});
