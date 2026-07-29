import type { ReactNode } from "react";
import { useElectronStore, type UserRole } from "@/lib/electron-store";

/**
 * Single conditional-rendering primitive for role segmentation — instead of
 * sprinkling `role === "admin"` checks per view, wrap the fragment:
 *
 *   <RoleGate allow={["admin", "warehouse_operator"]}>…</RoleGate>
 */
export function RoleGate({
  allow,
  fallback = null,
  children,
}: {
  allow: UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { role } = useElectronStore();
  return allow.includes(role) ? <>{children}</> : <>{fallback}</>;
}
