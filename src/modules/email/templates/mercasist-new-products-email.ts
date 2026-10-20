import { escapeHtml } from '../html-escape';
import { EMAIL_COLORS as C } from '../brand';
import { button, emailLayout, eyebrow, heading } from './base-layout';

/** Names listed in the email; the rest are counted. */
const LISTED = 12;

/** Sent to every admin when products on the web are ready to go on Mercado
 * Libre: Mercasist's API can't create listings, so they go up with its
 * bulk publisher, from the Excel the panel prepares. */
export function mercasistNewProductsEmail(
  event: { fresh: { name: string; sku: string }[]; totalReady: number },
  siteUrl: string,
): { subject: string; html: string } {
  const count = event.fresh.length;
  const listed = event.fresh.slice(0, LISTED);
  const rest = count - listed.length;
  const items = listed
    .map(
      (p) =>
        `<li style="margin:0 0 6px;">${escapeHtml(p.name)} <span style="color:${C.muted};font-size:12px;">· ${escapeHtml(p.sku)}</span></li>`,
    )
    .join('');
  const others = event.totalReady - count;

  const body = `
    ${eyebrow('Mercado Libre')}
    ${heading(count === 1 ? 'Un producto nuevo listo para publicar' : `${count} productos nuevos listos para publicar`)}
    <p style="margin:0 0 16px;">Ya están en la web con foto, precio y stock, y todavía no tienen publicación en Mercado Libre:</p>
    <ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>
    ${rest > 0 ? `<p style="margin:0 0 16px;color:${C.muted};">Y ${rest} más.</p>` : ''}
    ${others > 0 ? `<p style="margin:0 0 16px;color:${C.muted};">En total hay ${event.totalReady} por publicar.</p>` : ''}
    <p style="margin:0 0 8px;"><strong style="color:${C.navy};">Para publicarlos:</strong></p>
    <ol style="margin:0 0 20px;padding-left:20px;">
      <li style="margin:0 0 6px;">Descarga el Excel en el panel, en Mercado Libre.</li>
      <li style="margin:0 0 6px;">En Mercasist: Publicaciones → Publicación masiva → Nueva carga → Carga MercadoLibre, y súbelo.</li>
      <li style="margin:0 0 6px;">Ejecuta la carga. Desde ahí el precio, el stock, el nombre y la descripción se mantienen solos.</li>
    </ol>
    <p style="margin:0 0 12px;">${button('Descargar el Excel', `${siteUrl}/admin/mercasist`)}</p>
  `;

  return {
    subject:
      count === 1
        ? `Producto nuevo para Mercado Libre: ${event.fresh[0].name}`
        : `${count} productos nuevos para publicar en Mercado Libre`,
    html: emailLayout(`${count} por publicar en Mercado Libre`, body, siteUrl),
  };
}
