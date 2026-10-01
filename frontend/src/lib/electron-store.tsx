import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "./mock-data";
import { useAuth, type BackendRole } from "./auth-context";
import {
  reconcileCart,
  type CartItem,
  type CartSyncResult,
  type LiveCatalogLookup,
} from "./cart-reconcile";

export type UserRole = "guest" | "client" | "admin" | "warehouse_operator";

/** Venezuela's standard IVA rate. */
export const TAX_RATE = 0.16;

export interface DiscountInfo {
  code: string;
  type: "percentage" | "fixed";
  value: number;
}

type StoreValue = {
  role: UserRole;
  isAdmin: boolean;
  /** Operational staff: admin or warehouse operator — unlocks internal stock views. */
  isOps: boolean;
  /** Every client pays retail — a lower price only ever comes from an admin-approved quote. */
  priceFor: (p: Product) => number;
  cart: CartItem[];
  addToCart: (p: Product, qty?: number) => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  /** Cart items are localStorage snapshots taken at add-to-cart time — they
   * never see a later price/stock change on their own (the server is still
   * the source of truth at checkout, but the customer shouldn't be looking
   * at stale numbers before then). Call with the current catalog (e.g. on
   * the cart page) to refresh each line in place, dropping/clamping any
   * that no longer check out; returns what changed so the caller can tell
   * the customer. */
  syncCartWithCatalog: (live: LiveCatalogLookup) => CartSyncResult;
  cartTotal: number;
  cartCount: number;
  discount: DiscountInfo | null;
  setDiscount: (d: DiscountInfo) => void;
  clearDiscount: () => void;
  /** cartTotal minus discountAmount — before IVA and shipping. */
  taxableBase: number;
  discountAmount: number;
  taxAmount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CART_STORAGE_KEY = "electron-plus:cart";
const DISCOUNT_STORAGE_KEY = "electron-plus:discount";

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Corrupted value or storage unavailable (private browsing, quota) —
    // fall back to an empty cart instead of throwing.
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage full or unavailable — cart still works for the rest of the session.
  }
}

const StoreContext = createContext<StoreValue | null>(null);

function roleFromBackend(backendRole: BackendRole | undefined): UserRole {
  switch (backendRole) {
    case "client":
      return "client";
    case "admin":
      return "admin";
    case "warehouse_operator":
      return "warehouse_operator";
    default:
      return "guest";
  }
}

export function ElectronStoreProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const role = roleFromBackend(profile?.role);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscountState] = useState<DiscountInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Latest committed cart for callbacks that run after an await (the sync
  // below) — a closure over `cart` would be stale by then and clobber any
  // quantity change made while the catalog requests were in flight.
  const cartRef = useRef(cart);
  cartRef.current = cart;

  // Loaded client-side only, after mount — reading localStorage during the
  // initial render would make the client's first paint disagree with the
  // server-rendered markup and break hydration.
  useEffect(() => {
    setCart(readStorage<CartItem[]>(CART_STORAGE_KEY) ?? []);
    setDiscountState(readStorage<DiscountInfo>(DISCOUNT_STORAGE_KEY));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeStorage(CART_STORAGE_KEY, cart);
  }, [cart, hydrated]);

  useEffect(() => {
    if (hydrated) writeStorage(DISCOUNT_STORAGE_KEY, discount);
  }, [discount, hydrated]);

  const value = useMemo<StoreValue>(() => {
    const priceFor = (p: Product) => p.retailPrice;
    const cartTotal = cart.reduce((s, i) => s + priceFor(i.product) * i.qty, 0);
    const cartCount = cart.reduce((s, i) => s + i.qty, 0);
    const discountAmount = discount
      ? round2(
          discount.type === "percentage"
            ? (cartTotal * discount.value) / 100
            : Math.min(discount.value, cartTotal),
        )
      : 0;
    const taxableBase = Math.max(0, round2(cartTotal - discountAmount));
    const taxAmount = round2(taxableBase * TAX_RATE);
    return {
      role,
      isAdmin: role === "admin",
      isOps: role === "admin" || role === "warehouse_operator",
      priceFor,
      cart,
      addToCart: (p, qty = 1) =>
        setCart((prev) => {
          // stock <= 0 means truly nothing can be added — the ternary this
          // replaced fell back to the requested qty in that case, which is
          // no cap at all (every UI call site happens to disable its own
          // "add" button at 0 stock, but the store had no defense of its own).
          if (p.stock <= 0) return prev;
          const existing = prev.find((i) => i.product.id === p.id);
          if (existing) {
            const nextQty = Math.min(p.stock, existing.qty + qty);
            return prev.map((i) => (i.product.id === p.id ? { ...i, qty: nextQty } : i));
          }
          return [...prev, { product: p, qty: Math.min(p.stock, Math.max(1, qty)) }];
        }),
      removeFromCart: (id) => setCart((prev) => prev.filter((i) => i.product.id !== id)),
      updateQty: (id, qty) =>
        setCart((prev) =>
          prev
            .map((i) =>
              i.product.id === id
                ? { ...i, qty: Math.min(Math.max(i.product.stock, 0), Math.max(1, qty)) }
                : i,
            )
            // A cached item whose stock has since dropped to 0 (see
            // syncCartWithCatalog) would otherwise clamp to a silent,
            // unremovable qty-0 line — drop it instead.
            .filter((i) => i.qty > 0),
        ),
      clearCart: () => setCart([]),
      syncCartWithCatalog: (live) => {
        const { next, result } = reconcileCart(cartRef.current, live);
        setCart(next);
        return result;
      },
      cartTotal,
      cartCount,
      discount,
      setDiscount: setDiscountState,
      clearDiscount: () => setDiscountState(null),
      taxableBase,
      discountAmount,
      taxAmount,
    };
  }, [role, cart, discount]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useElectronStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useElectronStore must be used within ElectronStoreProvider");
  return ctx;
}

// Intl.NumberFormat only accepts real ISO 4217 codes, so USD is still what
// drives the number formatting (grouping, decimals) — the currency part
// gets swapped for a display label after formatting. Anything a customer
// can see (storefront, cart, checkout, emails, printed QR/price labels)
// must say "REF" (referencial), not "USD" — Venezuelan price regulations
// don't allow advertising retail prices as literal USD. Use this one for
// all of that.
export function formatMoney(n: number) {
  return formatMoneyWithLabel(n, "REF");
}

// Internal admin tooling only (dashboards, inventory, purchases, expenses,
// quotes management, etc.) — never shown to a customer, so the regulatory
// constraint above doesn't apply. Uses the plain $ symbol instead of the
// "REF" label so admin screens read like normal accounting figures.
export function formatMoneyAdmin(n: number) {
  return formatMoneyWithLabel(n, "$");
}

function formatMoneyWithLabel(n: number, label: string) {
  const parts = new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).formatToParts(n);
  return parts.map((part) => (part.type === "currency" ? label : part.value)).join("");
}
