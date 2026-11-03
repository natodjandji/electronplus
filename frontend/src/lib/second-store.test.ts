import { describe, expect, it } from "vitest";
import { isFromSecondStoreErp } from "./second-store";

describe("isFromSecondStoreErp", () => {
  it("treats a record as Profit Plus's unless an admin made it by hand", () => {
    expect(isFromSecondStoreErp({ source: "erp" })).toBe(true);
    // Records from before `source` existed all came from the sync.
    expect(isFromSecondStoreErp({})).toBe(true);
    expect(isFromSecondStoreErp({ source: "manual" })).toBe(false);
  });
});
