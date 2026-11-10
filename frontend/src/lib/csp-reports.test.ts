import { afterEach, describe, expect, it, vi } from "vitest";
import { describeCspViolation, watchCspViolations, type CspViolation } from "./csp-reports";

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

describe("watchCspViolations", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A page with one violation from before the app started (the Reporting
   * API's buffer) and a way to raise more afterwards. */
  function page(buffered: object[] = []) {
    const sent: { message: string; route: string; mechanism: string; stack?: string }[] = [];
    let onEvent: (violation: CspViolation) => void = () => {};
    let observerOptions: unknown;
    vi.stubGlobal("window", { location: { pathname: "/catalog" } });
    vi.stubGlobal("document", {
      addEventListener: (type: string, listener: (violation: CspViolation) => void) => {
        if (type === "securitypolicyviolation") onEvent = listener;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body));
        return Promise.resolve();
      }),
    );
    vi.stubGlobal(
      "ReportingObserver",
      class {
        constructor(
          private callback: (reports: { body: object }[]) => void,
          options: unknown,
        ) {
          observerOptions = options;
        }
        observe() {
          this.callback(buffered.map((body) => ({ body })));
        }
      },
    );
    watchCspViolations();
    return { sent, raise: (violation: CspViolation) => onEvent(violation), observerOptions };
  }

  const beacon = {
    effectiveDirective: "script-src-elem",
    blockedURL: "https://cdn.example.com/beacon.js?v=1",
    sourceFile: null,
    lineNumber: null,
    disposition: "report",
  };

  it("reports what the page loaded before the app started", () => {
    const { sent, observerOptions } = page([beacon]);
    expect(observerOptions).toEqual({ types: ["csp-violation"], buffered: true });
    expect(sent).toEqual([
      {
        message: "CSP would block script-src-elem: https://cdn.example.com/beacon.js",
        route: "/catalog",
        mechanism: "csp",
      },
    ]);
  });

  it("sends a violation once, whichever way it arrives", () => {
    const { sent, raise } = page([beacon]);
    raise({ effectiveDirective: "script-src-elem", blockedURI: "https://cdn.example.com/b.js" });
    raise({ effectiveDirective: "img-src", blockedURI: "https://cdn.example.com/a.png" });
    expect(sent.map((report) => report.message)).toEqual([
      "CSP would block script-src-elem: https://cdn.example.com/beacon.js",
      "CSP would block img-src: https://cdn.example.com/a.png",
    ]);
  });

  it("stops at ten reports a page", () => {
    const { sent, raise } = page();
    for (let n = 0; n < 25; n++) {
      raise({ effectiveDirective: "img-src", blockedURI: `https://site-${n}.example/a.png` });
    }
    expect(sent).toHaveLength(10);
  });

  it("still works in a browser without the Reporting API", () => {
    const { sent, raise } = page();
    vi.stubGlobal("ReportingObserver", undefined);
    watchCspViolations();
    raise({ effectiveDirective: "img-src", blockedURI: "https://cdn.example.com/a.png" });
    expect(sent).toHaveLength(1);
  });
});
