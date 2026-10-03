import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("lists every page when there are only a few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("keeps first, last and the current page's neighbours, with gaps between", () => {
    expect(pageWindow(42, 300)).toEqual([1, "gap-start", 41, 42, 43, "gap-end", 300]);
  });

  it("drops the gap on the side that touches an edge", () => {
    expect(pageWindow(1, 300)).toEqual([1, 2, "gap-end", 300]);
    expect(pageWindow(3, 300)).toEqual([1, 2, 3, 4, "gap-end", 300]);
    expect(pageWindow(300, 300)).toEqual([1, "gap-start", 299, 300]);
  });
});
