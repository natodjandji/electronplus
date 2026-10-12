import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SellerGuard } from "@/components/admin-guard";

export const Route = createFileRoute("/vendedor")({
  head: () => ({
    meta: [
      { title: "Ventas en tienda · Electron Plus" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <SellerGuard>
      <Outlet />
    </SellerGuard>
  ),
});
