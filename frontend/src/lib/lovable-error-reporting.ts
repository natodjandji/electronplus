type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  window.__lovableReportRuntimeError?.({
    message,
    stack,
    filename: window.location.pathname,
  });

  // The editor hooks above are only present in the Lovable preview iframe —
  // in production (electronplus-ve.web.app) neither fires, which is exactly
  // why the two prior "algo salió mal" fixes shipped blind. Mirror the same
  // report to the backend so it lands in Cloud Run logs, queryable via
  // `gcloud logging read`. Fire-and-forget: a broken error reporter must
  // never throw on top of the error it's reporting.
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";
  fetch(`${apiBaseUrl}/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stack,
      route: window.location.pathname,
      mechanism: typeof context.boundary === "string" ? context.boundary : undefined,
    }),
    keepalive: true,
  }).catch(() => {});
}
