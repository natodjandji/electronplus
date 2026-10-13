import { API_BASE_URL, apiFetch } from "./api-client";

/**
 * Opens a server-built PDF whose URL is only known after a request. On a
 * computer it goes to a new tab — opened inside the click, since one
 * opened after the request returns is blocked as a popup. On a phone it
 * opens in place, and the phone hands it to its PDF viewer to print or
 * share. Rejects (closing the spare tab) if the request fails.
 */
export async function openPdf(resolveUrl: () => Promise<string>): Promise<void> {
  const tab = window.matchMedia("(pointer: fine)").matches ? window.open("", "_blank") : null;
  try {
    const url = await resolveUrl();
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** A customer quote's PDF — same sheet as the sellers' quotes. The PDF opens
 * without the Bearer token, so its owner (or an admin) first gets its
 * unguessable link. */
export function openCustomerQuotePdf(quoteId: string): Promise<void> {
  return openPdf(async () => {
    const { token } = await apiFetch<{ token: string }>(
      `/quotes/${encodeURIComponent(quoteId)}/pdf-link`,
      { method: "POST" },
    );
    return `${API_BASE_URL}/quote-pdfs/${encodeURIComponent(token)}`;
  });
}
