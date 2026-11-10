import { describe, expect, it } from "vitest";
import { describeCspViolation } from "./csp-reports";

describe("describeCspViolation", () => {
  it("says what would be blocked while the policy is report-only", () => {
    expect(
      describeCspViolation({
        effectiveDirective: "script-src-elem",
        blockedURI: "https://cdn.example.com/widget.js",
        sourceFile: "https://electronplus.com.ve/assets/index-abc.js",
        lineNumber: 12,
        disposition: "report",
      }),
    ).toEqual({
      key: "script-src-elem https://cdn.example.com",
      message: "CSP would block script-src-elem: https://cdn.example.com/widget.js",
      source: "https://electronplus.com.ve/assets/index-abc.js:12",
    });
  });

  it("says what was blocked once it's enforced", () => {
    const report = describeCspViolation({
      effectiveDirective: "connect-src",
      blockedURI: "https://evil.example/collect",
      disposition: "enforce",
    });
    expect(report?.message).toBe("CSP blocked connect-src: https://evil.example/collect");
  });

  it("drops the query, where a signed link keeps its signature", () => {
    const report = describeCspViolation({
      effectiveDirective: "img-src",
      blockedURI: "https://files.example.com/proof.jpg?X-Goog-Signature=abc123#frag",
      sourceFile: "https://electronplus.com.ve/admin/orders?token=secret",
    });
    expect(report?.message).toBe("CSP would block img-src: https://files.example.com/proof.jpg");
    expect(report?.source).toBe("https://electronplus.com.ve/admin/orders");
    expect(JSON.stringify(report)).not.toMatch(/abc123|secret/);
  });

  it("keeps keywords as they come, and groups a site's files under one key", () => {
    expect(describeCspViolation({ effectiveDirective: "script-src", blockedURI: "eval" })).toEqual({
      key: "script-src eval",
      message: "CSP would block script-src: eval",
      source: undefined,
    });
    expect(describeCspViolation({ effectiveDirective: "script-src", blockedURI: "" })?.key).toBe(
      "script-src inline",
    );
    const key = (blockedURI: string) =>
      describeCspViolation({ effectiveDirective: "img-src", blockedURI })?.key;
    expect(key("https://img.example.com/a.png")).toBe(key("https://img.example.com/b/c.png"));
  });

  it("ignores what a browser extension injects", () => {
    expect(
      describeCspViolation({
        effectiveDirective: "script-src-elem",
        blockedURI: "chrome-extension://abcdef/inject.js",
      }),
    ).toBeNull();
    expect(
      describeCspViolation({
        effectiveDirective: "style-src-elem",
        blockedURI: "inline",
        sourceFile: "moz-extension://abcdef/content.js",
      }),
    ).toBeNull();
  });
});
