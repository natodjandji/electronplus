/** What a page reports at most: one broken page can't flood the logs. */
const MAX_REPORTS_PER_PAGE = 10;
/** Scripts and styles a browser extension injects into the page break the
 * policy too. They aren't the site's, so they aren't reported. */
const NOT_THE_SITE = /^(chrome|moz|safari|safari-web|ms-browser)-extension:|^webkit-masked-url:/;

export interface CspViolation {
  effectiveDirective: string;
  blockedURI: string;
  sourceFile?: string | null;
  lineNumber?: number;
  disposition?: string;
}

/** A URL without its query or fragment, which can carry a signature or an
 * id. A keyword ("inline", "eval", "data") comes back as it is. */
function withoutQuery(uri: string): string {
  return uri.split(/[?#]/)[0].slice(0, 300);
}

/**
 * A policy violation as one log line, with the key that tells it apart from
 * the others on the page (the same source under the same directive is
 * reported once). Null for one that isn't the site's doing.
 */
export function describeCspViolation(
  violation: CspViolation,
): { key: string; message: string; source?: string } | null {
  const blocked = withoutQuery(violation.blockedURI || "inline");
  const source = violation.sourceFile ? withoutQuery(violation.sourceFile) : undefined;
  if (NOT_THE_SITE.test(blocked) || (source && NOT_THE_SITE.test(source))) return null;

  let origin = blocked;
  try {
    origin = new URL(blocked).origin;
  } catch {
    // A keyword, not a URL.
  }
  const enforced = violation.disposition === "enforce";
  return {
    key: `${violation.effectiveDirective} ${origin}`,
    message: `CSP ${enforced ? "blocked" : "would block"} ${violation.effectiveDirective}: ${blocked}`,
    source: source && violation.lineNumber ? `${source}:${violation.lineNumber}` : source,
  };
}

/**
 * Sends what the Content-Security-Policy blocks, or would block while it's
 * report-only (see csp.ts), to the API's logs: the way to find out what the
 * policy is missing before it's enforced, and what it stops afterwards.
 */
export function watchCspViolations(): void {
  // Read here rather than imported from api-client, which brings Firebase
  // along: this has to work while the rest of the app is still loading.
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
  const reported = new Set<string>();
  const send = (violation: CspViolation) => {
    const report = describeCspViolation(violation);
    if (!report || reported.has(report.key) || reported.size >= MAX_REPORTS_PER_PAGE) return;
    reported.add(report.key);
    // Fire-and-forget: a reporter must never break the page it reports on.
    fetch(`${apiBaseUrl}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: report.message,
        stack: report.source,
        route: window.location.pathname,
        mechanism: "csp",
      }),
      keepalive: true,
    }).catch(() => {});
  };

  document.addEventListener("securitypolicyviolation", send);

  // That event only reaches a listener already in place, and the browser
  // checks what the page's own HTML loads before any of this runs: the
  // script a CDN or an in-app browser adds to the page, for one. The
  // Reporting API keeps those and hands them over on request. Both report
  // what happens from here on; `reported` sends each once.
  if (typeof ReportingObserver === "function") {
    new ReportingObserver(
      (reports) => {
        for (const { body } of reports) {
          const violation = body as CSPViolationReportBody | null;
          if (!violation) continue;
          send({
            effectiveDirective: violation.effectiveDirective,
            blockedURI: violation.blockedURL ?? "",
            sourceFile: violation.sourceFile,
            lineNumber: violation.lineNumber ?? undefined,
            disposition: violation.disposition,
          });
        }
      },
      { types: ["csp-violation"], buffered: true },
    ).observe();
  }
}
