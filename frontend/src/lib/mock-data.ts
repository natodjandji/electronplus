export type Product = {
  id: string;
  sku: string;
  name: string;
  /** Category code — Profit Plus's own categories once the ERP catalog is
   * live, so not limited to the demo CATEGORIES below. */
  category: string;
  /** Display name for `category`, when it came from the API. */
  categoryLabel?: string;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  warehouse: string;
  image: string;
  /** Smaller variant of `image` for list/cart/card views — falls back to
   * `image` itself for products uploaded before thumbnails existed. */
  thumbnail: string;
  specs: string;
};

export const CATEGORIES: { id: Product["category"]; label: string }[] = [
  { id: "iluminacion", label: "Iluminación" },
  { id: "cables", label: "Cables" },
  { id: "tableros", label: "Tableros" },
  { id: "tomas", label: "Tomas e interruptores" },
  { id: "proteccion", label: "Protección" },
];
