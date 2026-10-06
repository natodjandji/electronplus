export type Product = {
  id: string;
  sku: string;
  name: string;
  /** Category code, as the API (and Profit Plus) names it. */
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
