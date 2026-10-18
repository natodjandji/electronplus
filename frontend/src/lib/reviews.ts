/** One answer to "¿Cómo llegaste a la tienda?". */
export interface ReviewSource {
  id: string;
  label: string;
}

/** What the public form offers: the answers ("Otro" last) and the sellers. */
export interface ReviewForm {
  sources: ReviewSource[];
  sellers: { id: string; name: string }[];
}

export interface Review {
  id: string;
  rating: number;
  sourceId: string;
  sourceLabel: string;
  sourceOther?: string;
  sellerId?: string;
  sellerName?: string;
  message?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
}

/** Always last on the form, with a text box. */
export const OTHER_SOURCE_ID = "otro";

/** The words under the stars, by rating (index 1–5). */
export const RATING_LABELS = ["", "Muy mala", "Mala", "Regular", "Buena", "Excelente"] as const;

export const reviewsKey = ["admin", "reviews"] as const;
