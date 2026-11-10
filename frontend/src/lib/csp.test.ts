import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCsp, CSP_DIRECTIVES } from "./csp";

interface HostingHeaders {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
}

const firebaseJson = JSON.parse(
  readFileSync(new URL("../../../firebase.json", import.meta.url), "utf8"),
) as HostingHeaders;
const siteHeaders = firebaseJson.hosting.headers.find((rule) => rule.source === "**")?.headers;
const header = (key: string) => siteHeaders?.find((h) => h.key === key)?.value;

describe("the storefront's Content-Security-Policy", () => {
  it("is what firebase.json sends, enforced or report-only", () => {
    const sent = header("Content-Security-Policy-Report-Only") ?? header("Content-Security-Policy");
    expect(sent).toBe(buildCsp());
  });

  it("keeps the page out of other sites' frames whichever mode it's in", () => {
    expect(header("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("joins directives the way browsers read them", () => {
    expect(buildCsp({ "default-src": ["'self'"], "img-src": ["'self'", "data:"] })).toBe(
      "default-src 'self'; img-src 'self' data:",
    );
  });

  it("never lets scripts run from any site, eval strings, or load plugins", () => {
    const scripts = CSP_DIRECTIVES["script-src"];
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts.filter((source) => /^(\*|https?:|data:|blob:)$/.test(source))).toEqual([]);
    expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES["base-uri"]).toEqual(["'self'"]);
  });

  it("only names https and wss sources", () => {
    const sources = Object.values(CSP_DIRECTIVES).flat();
    const urls = sources.filter((source) => source.includes("//"));
    expect(urls.filter((source) => !/^(https|wss):\/\/[a-z0-9*.-]+$/.test(source))).toEqual([]);
  });
});
