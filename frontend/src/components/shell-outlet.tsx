import { Outlet, useHydrated } from "@tanstack/react-router";
import { Suspense } from "react";

/** Set by the script scripts/finalize-hosting.mjs puts in the app shell
 * (_shell.html, and the home page's index.html, which is a copy of it). */
const servedShell =
  typeof window !== "undefined" &&
  (window as unknown as { __EP_SHELL__?: boolean }).__EP_SHELL__ === true;

/**
 * The root's <Outlet />. Hosting answers every URL without a prerendered
 * file with the app shell, whose page slot is two empty Suspense boundaries
 * (the outlet's and the page's). The router doesn't always hydrate that
 * slot the same way: when the page's code has already loaded it draws the
 * page straight away, which doesn't match, and React reports error #418 and
 * redraws the whole app. So while hydrating the shell this draws the slot
 * exactly as the shell has it, and the page right after. A prerendered page
 * hydrates through the outlet as usual.
 */
export function ShellOutlet() {
  const hydrated = useHydrated();
  if (servedShell && !hydrated) {
    return (
      <Suspense fallback={null}>
        <Suspense fallback={null}>{null}</Suspense>
      </Suspense>
    );
  }
  return <Outlet />;
}
