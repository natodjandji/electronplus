import { apiFetch } from "./api-client";

/** Downscales/recompresses an image file client-side so it's a reasonable
 * size to upload — the backend re-encodes it to WebP at the actual display
 * sizes, this pass just keeps the upload itself small. */
export function compressImageToBase64(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Compresses then uploads a product photo to Cloud Storage, returning the
 * full-size and thumbnail URLs — use the result as `imageUrl` instead of
 * embedding the base64 itself in the product record. */
export async function uploadProductImage(
  file: File,
): Promise<{ url: string; thumbnailUrl: string }> {
  const base64 = await compressImageToBase64(file);
  return apiFetch<{ url: string; thumbnailUrl: string }>("/uploads/product-image", {
    method: "POST",
    body: { image: base64 },
  });
}
