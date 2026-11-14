import { ApiError, apiFetch } from "./api-client";
import { toProduct, type ApiProduct } from "./product-api";

/** Matches CreateProductGroupDto: membership and order are chosen by an admin. */
export const MIN_GROUP_PRODUCTS = 2;
export const MAX_GROUP_PRODUCTS = 40;
export const MAX_GROUP_LABELS = 200;

export interface ProductGroup {
  id: string;
  name: string;
  productIds: string[];
}

export interface GroupQrLabel {
  groupId: string;
  name: string;
  count: number;
  groupUrl: string;
  qrImageDataUrl: string;
}

interface ApiProductGroup {
  id: string;
  name: string;
  products: ApiProduct[];
}

export const ADMIN_PRODUCT_GROUPS_KEY = ["admin", "product-groups"] as const;
export const GROUP_LABELS_KEY = ["admin", "group-labels"] as const;

/** Public page and POS share the same projection; inactive/deleted products
 * are omitted by the server, which resolves members from its catalog cache. */
export function productGroupQuery(id: string) {
  return {
    queryKey: ["product-groups", id],
    queryFn: async () => {
      const group = await apiFetch<ApiProductGroup>(`/product-groups/${encodeURIComponent(id)}`);
      return { id: group.id, name: group.name, products: group.products.map(toProduct) };
    },
    staleTime: 60_000,
    retry: (failures: number, error: Error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
  };
}
