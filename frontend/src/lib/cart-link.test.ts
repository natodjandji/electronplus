import { describe, expect, it } from "vitest";
import { parseCartLink } from "./cart-link";

describe("parseCartLink", () => {
  it("reads id:qty pairs", () => {
    expect(parseCartLink("p1:4,p2:3")).toEqual([
      { id: "p1", qty: 4 },
      { id: "p2", qty: 3 },
    ]);
  });

  it("decodes ids, keeps the last quantity of a repeated id and skips bad pieces", () => {
    expect(parseCartLink("a%20b:2,p1:1,p1:5,:3,x:0,y:abc,z")).toEqual([
      { id: "a b", qty: 2 },
      { id: "p1", qty: 5 },
    ]);
  });
});
