import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/** The page-level tags route heads declare — the ones a prerendered page
 * ships statically and HeadContent then renders again on the client. */
const ROUTE_HEAD_TAGS =
  'meta[name], meta[property], link[rel="canonical"], script[type="application/ld+json"]';

/**
 * Prerendered HTML (and the shell every other URL is served) carries its
 * page's head tags statically, but the first client render runs before the
 * matched route has loaded, so React never adopts the route's own tags: it
 * inserts fresh copies once the route resolves and leaves the static ones
 * behind. The result was two canonicals and two JSON-LD blocks on every
 * prerendered page — and on product pages served from the shell, the
 * homepage's description and og:title sitting next to the product's.
 *
 * Once the first navigation has settled, HeadContent owns the full set, so
 * any such tag React doesn't own (no fiber attached) is a leftover and goes.
 * Stylesheets, preloads and anything injected by third parties are outside
 * the selector and untouched.
 */
export function useDropStaleHeadTags() {
  const settled = useRouterState({ select: (s) => s.status === "idle" && !s.isLoading });
  const done = useRef(false);

  useEffect(() => {
    if (!settled || done.current) return;
    done.current = true;
    // After this commit's hoisted head tags are in place.
    requestAnimationFrame(() => {
      for (const el of document.head.querySelectorAll(ROUTE_HEAD_TAGS)) {
        const ownedByReact = Object.keys(el).some((key) => key.startsWith("__reactFiber$"));
        if (!ownedByReact) el.remove();
      }
    });
  }, [settled]);
}
