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
  specs: string;
};

export const CATEGORIES: { id: Product["category"]; label: string }[] = [
  { id: "iluminacion", label: "Iluminación" },
  { id: "cables", label: "Cables" },
  { id: "tableros", label: "Tableros" },
  { id: "tomas", label: "Tomas e interruptores" },
  { id: "proteccion", label: "Protección" },
];

export const PRODUCTS: Product[] = [
  {
    id: "p-001",
    sku: "EP-LED-9W",
    name: "Bombillo LED 9W E27 luz fría",
    category: "iluminacion",
    retailPrice: 4.5,
    wholesalePrice: 3.2,
    stock: 320,
    warehouse: "Depósito A · Estante 3B",
    image: "https://images.unsplash.com/photo-1553501128-b6b6d8b6f2ec?w=600&auto=format",
    specs: "9W · 220V · 6500K · 900lm · Base E27",
  },
  {
    id: "p-002",
    sku: "EP-CBL-12AWG",
    name: "Cable THHN 12 AWG (rollo 100m)",
    category: "cables",
    retailPrice: 68,
    wholesalePrice: 55,
    stock: 12,
    warehouse: "Depósito B · Pasillo 1",
    image: "https://images.unsplash.com/photo-1620325867502-221cfb5faa5f?w=600&auto=format",
    specs: "Cobre 100% · 600V · Aislamiento THHN/THWN",
  },
  {
    id: "p-003",
    sku: "EP-BRK-2P32",
    name: "Breaker enchufable 2P 32A",
    category: "proteccion",
    retailPrice: 14.9,
    wholesalePrice: 11.4,
    stock: 4,
    warehouse: "Depósito A · Estante 1A",
    image: "https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?w=600&auto=format",
    specs: "Bipolar · 32A · 10kA · Curva C",
  },
  {
    id: "p-004",
    sku: "EP-PNL-8C",
    name: "Tablero eléctrico 8 circuitos",
    category: "tableros",
    retailPrice: 42,
    wholesalePrice: 34,
    stock: 0,
    warehouse: "Depósito C · Rack 2",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format",
    specs: "8 espacios · Empotrable · Barra neutro/tierra",
  },
  {
    id: "p-005",
    sku: "EP-TC-DPL",
    name: "Toma doble polarizada con tierra",
    category: "tomas",
    retailPrice: 3.1,
    wholesalePrice: 2.25,
    stock: 540,
    warehouse: "Depósito A · Estante 4C",
    image: "https://images.unsplash.com/photo-1519824145371-296894a0daa9?w=600&auto=format",
    specs: "15A · 125V · Placa blanca",
  },
  {
    id: "p-006",
    sku: "EP-LED-PNL-24W",
    name: "Panel LED plafón 24W redondo",
    category: "iluminacion",
    retailPrice: 12.5,
    wholesalePrice: 9.6,
    stock: 78,
    warehouse: "Depósito A · Estante 3A",
    image: "https://images.unsplash.com/photo-1524634126442-357e0eac3c14?w=600&auto=format",
    specs: "24W · 4000K · 2000lm · Empotrable Ø225mm",
  },
  {
    id: "p-007",
    sku: "EP-CBL-10AWG",
    name: "Cable THHN 10 AWG (rollo 100m)",
    category: "cables",
    retailPrice: 92,
    wholesalePrice: 76,
    stock: 6,
    warehouse: "Depósito B · Pasillo 1",
    image: "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?w=600&auto=format",
    specs: "Cobre 100% · 600V · Aislamiento THHN",
  },
  {
    id: "p-008",
    sku: "EP-INT-1V",
    name: "Interruptor 1 vía blanco",
    category: "tomas",
    retailPrice: 2.4,
    wholesalePrice: 1.8,
    stock: 420,
    warehouse: "Depósito A · Estante 4A",
    image: "https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format",
    specs: "10A · 250V · Instalación empotrada",
  },
];

export const SALES_SERIES = [
  { month: "Ene", ventas: 12400, compras: 8200 },
  { month: "Feb", ventas: 15800, compras: 9100 },
  { month: "Mar", ventas: 14200, compras: 8600 },
  { month: "Abr", ventas: 18900, compras: 11200 },
  { month: "May", ventas: 22400, compras: 12800 },
  { month: "Jun", ventas: 20100, compras: 11900 },
  { month: "Jul", ventas: 25300, compras: 13400 },
];

export const CATEGORY_SHARE = [
  { name: "Iluminación", value: 38 },
  { name: "Cables", value: 24 },
  { name: "Protección", value: 18 },
  { name: "Tomas", value: 12 },
  { name: "Tableros", value: 8 },
];

export type SupplierInvoice = {
  id: string;
  supplier: string;
  amount: number;
  dueInDays: number;
  status: "vigente" | "por-vencer" | "vencida";
};

export const SUPPLIER_INVOICES: SupplierInvoice[] = [
  { id: "F-2041", supplier: "Distribuidora Corriente C.A.", amount: 1240, dueInDays: 2, status: "por-vencer" },
  { id: "F-2042", supplier: "Iluminatec SRL", amount: 3480, dueInDays: -3, status: "vencida" },
  { id: "F-2043", supplier: "CablesPro Import", amount: 5210, dueInDays: 12, status: "vigente" },
  { id: "F-2044", supplier: "TecnoBreaker Andina", amount: 890, dueInDays: 5, status: "por-vencer" },
];
