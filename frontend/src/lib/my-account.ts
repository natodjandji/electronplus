import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuth, type UserProfile } from "@/lib/auth-context";

/** The signed-in customer's own account (GET /users/me): what the profile
 * page edits and the checkout and quote form fill in from. */
export interface MyAccount extends UserProfile {
  phone?: string;
  whatsappUpdates?: boolean;
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
  /** Set by an admin for wholesale accounts — the only ones that may pay on credit. */
  creditLimit?: number;
}

/** One cache entry for every page that reads it, so a change saved on one
 * is what the next one fills in from. */
export const MY_ACCOUNT_KEY = ["users", "me"] as const;

export function useMyAccount(enabled = true) {
  return useQuery({
    queryKey: MY_ACCOUNT_KEY,
    queryFn: () => apiFetch<MyAccount>("/users/me"),
    enabled,
  });
}

/** Puts an account PATCH /users/me just returned everywhere it shows: the
 * shared cache and the header's name. */
export function useAccountSaved(): (saved: MyAccount) => void {
  const queryClient = useQueryClient();
  const { applySavedProfile } = useAuth();
  return (saved) => {
    queryClient.setQueryData(MY_ACCOUNT_KEY, saved);
    applySavedProfile(saved);
  };
}
