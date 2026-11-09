import { describe, expect, it } from "vitest";
import { escapeHtml, safeJsonLd } from "./text";

describe("escapeHtml", () => {
  it("neutralizes tags, quotes and ampersands", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
    );
  });

  it("leaves a plain URL readable", () => {
    expect(escapeHtml("https://electronplus-ve.web.app/resena")).toBe(
      "https://electronplus-ve.web.app/resena",
    );
  });
});

describe("safeJsonLd", () => {
  it("can't close the script tag it's written into", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
