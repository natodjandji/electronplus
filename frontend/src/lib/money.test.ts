import { describe, expect, it } from "vitest";
import { priceWithTax, round2 } from "./money";

describe("round2", () => {
  it("rounds halves up, including the ones binary floats store just below", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.145)).toBe(0.15);
    expect(round2(2.135)).toBe(2.14);
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1.00499)).toBe(1);
    expect(round2(1.004)).toBe(1);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(82.645)).toBe(82.65);
  });
});

describe("priceWithTax", () => {
  it.each([
    [2.2, { base: 2.2, tax: 0.35, total: 2.55 }],
    [1.6, { base: 1.6, tax: 0.26, total: 1.86 }],
    [0.91, { base: 0.91, tax: 0.15, total: 1.06 }],
    [2.135, { base: 2.14, tax: 0.34, total: 2.48 }],
    [1999.99, { base: 1999.99, tax: 320, total: 2319.99 }],
    [0, { base: 0, tax: 0, total: 0 }],
  ])("shows the unit-sale breakdown for %s", (price, expected) => {
    expect(priceWithTax(price, 0.16)).toEqual(expected);
  });
});
