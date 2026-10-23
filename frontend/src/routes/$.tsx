import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/not-found-page";
import { NOT_FOUND_HEAD } from "@/lib/not-found";

// Catch-all for URLs no route matches. Without it the root route draws its
// notFoundComponent in place of the whole app (providers and all), which
// can't match the app shell Hosting answers these URLs with, and React
// reported a hydration mismatch (error #418) on every 404. As a route it
// renders through the root's ShellOutlet like any page without a
// prerendered file. Its title and noindex go through head(), as every
// route's do.
export const Route = createFileRoute("/$")({
  head: () => NOT_FOUND_HEAD,
  component: NotFoundPage,
});
