import { FirestoreDoc } from '../../../firebase/firestore.repository';

/** One answer to "¿Cómo llegaste a la tienda?". */
export interface ReviewSource {
  id: string;
  label: string;
}

/** Always offered last, with a text box, so the list never leaves a customer
 * without an answer. Not part of the editable list. */
export const OTHER_SOURCE: ReviewSource = { id: 'otro', label: 'Otro' };

/** What the list starts with until an admin edits it. */
export const DEFAULT_REVIEW_SOURCES: ReviewSource[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'google', label: 'Google / Google Maps' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'recomendacion', label: 'Me lo recomendaron' },
  { id: 'pasaba', label: 'Pasaba por aquí' },
  { id: 'cliente', label: 'Ya soy cliente' },
];

/** settings/reviews — the editable answers to "¿Cómo llegaste?". */
export interface ReviewSettings extends FirestoreDoc {
  sources: ReviewSource[];
}

/** A review a customer left through the store's QR. Labels and names are
 * copied in, so renaming or removing an answer or a seller later doesn't
 * change what past reviews say. */
export interface Review extends FirestoreDoc {
  /** 1 to 5 stars for the attention received. */
  rating: number;
  sourceId: string;
  sourceLabel: string;
  /** What the customer wrote when they picked "Otro". */
  sourceOther?: string;
  sellerId?: string;
  sellerName?: string;
  message?: string;
  customerName?: string;
  /** "0414-1234567", as the web's phone field writes it. */
  customerPhone?: string;
}
