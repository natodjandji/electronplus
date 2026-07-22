import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClientGuard } from "@/components/client-guard";

export const Route = createFileRoute("/client")({
  component: () => (
    <ClientGuard>
      <Outlet />
    </ClientGuard>
  ),
});
