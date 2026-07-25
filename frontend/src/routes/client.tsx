import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClientGuard } from "@/components/client-guard";

export const Route = createFileRoute("/client")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <ClientGuard>
      <Outlet />
    </ClientGuard>
  ),
});
