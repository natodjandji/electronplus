import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // React Query's own default is staleTime: 0 — every mount of a
        // query is treated as stale, so even two components sharing the
        // exact same queryKey (see the "Shared queryKey with ..." comments
        // across routes/lib) still trigger a background refetch on the
        // second one's mount. A minute is long enough that navigating
        // between pages needing the same data (catalog → collections →
        // quote builder, admin dashboard → admin products, etc.) reuses the
        // cached response outright instead of re-hitting Firestore, while
        // staying short enough that admin edits still show up promptly —
        // mutations explicitly invalidate their own queries anyway, so this
        // only affects the "nobody changed anything" case.
        staleTime: 60_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
