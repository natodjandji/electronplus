import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin-guard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AdminGuard>
      <Outlet />
    </AdminGuard>
  ),
});
