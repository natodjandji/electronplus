export type Product = {
  id: string;
  sku: string;
  name: string;
  category: "iluminacion" | "cables" | "tableros" | "tomas" | "proteccion";
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
