import { createFileRoute, redirect } from "@tanstack/react-router";

/** Physical QR labels already printed point here — keep resolving forever,
 * just hand off to the canonical product page so there's one URL per
 * product for SEO instead of two indexable duplicates. */
export const Route = createFileRoute("/product/qr/$id")({
  loader: ({ params }) => {
    throw redirect({ to: "/product/$id", params: { id: params.id } });
  },
});
