import type { Product } from "./mock-data";

export interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  specs?: string;
  category: { id: string; code: string; label: string };
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  imageUrl?: string;
}

export function toProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category.code as Product["category"],
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    stock: p.stock,
    warehouse: "",
    image: p.imageUrl ?? "",
    specs: p.specs ?? "",
  };
}
