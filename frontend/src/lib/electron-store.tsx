import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Product } from "./mock-data";
import { useAuth, type BackendRole } from "./auth-context";

export type UserRole = "guest" | "client" | "admin" | "warehouse_operator";

/** Venezuela's standard IVA rate. */
export const TAX_RATE = 0.16;

export interface DiscountInfo {
  code: string;
  type: "percentage" | "fixed";
  value: number;
}

type CartItem = { product: Product; qty: number };

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
          const existing = prev.find((i) => i.product.id === p.id);
          if (existing)
            return prev.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + qty } : i));
          return [...prev, { product: p, qty }];
        }),
      removeFromCart: (id) => setCart((prev) => prev.filter((i) => i.product.id !== id)),
      updateQty: (id, qty) =>
        setCart((prev) =>
          prev.map((i) => (i.product.id === id ? { ...i, qty: Math.max(1, qty) } : i)),
        ),
      clearCart: () => setCart([]),
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

export function formatMoney(n: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}
