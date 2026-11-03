import { Injectable, Logger } from '@nestjs/common';
import { fetchBridge } from '../../../common/http/fetch-bridge';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.validation';
import { slugify } from '../../../common/utils/slug';
import {
  ErpInventoryItem,
  ErpNotConfiguredError,
  ErpSaleExport,
  ProfitPlusAdapter,
} from './profit-plus-adapter.interface';

interface BridgeProduct {
  /** Profit Plus's internal article code: unique, the product's identity. */
  codigo: string;
  /** The article's reference: the barcode the store labels it with. */
  referencia?: string | null;
  /** The article's Modelo field, where the store keeps its SKU; null when
   * empty, absent from bridges that predate it. */
  modelo?: string | null;
  descripcion: string;
  /** Profit Plus's code for the item's category; null when it has none. */
  categoriaCodigo?: string | null;
  categoria: string | null;
  /** Profit Plus's code for the item's brand, and its name; null when the
   * item has none. */
  marcaCodigo?: string | null;
  marca?: string | null;
  stock: number;
  precio1: number;
  precio2: number;
}

interface BridgeResponse {
  total: number;
  productos: BridgeProduct[];
  /** The art column the bridge found the SKU in (the Modelo field); null
   * when it found none, absent from bridges before 1.2.0. */
  columnaSku?: string | null;
  /** All of art's columns, sent when it found none: to see what it's called. */
  columnasArt?: string[];
}

/**
 * Talks to profit-plus-bridge-principal/ (see that project's own README) —
 * the small on-premise REST bridge in front of the primary store's Profit
 * Plus SQL Server. PROFIT_PLUS_API_URL/PROFIT_PLUS_API_KEY point at wherever
 * that bridge ends up exposed once it's actually deployed (its README's
 * "Exponerla a internet" section covers the tunnel/port-forward options).
 *
 * Both env vars are optional so the app boots fine before the bridge
 * exists — fetchInventory() throws a clear "not configured" error instead
 * of a confusing fetch failure while the URL/key are still empty.
 */
@Injectable()
export class ApiProfitPlusAdapter implements ProfitPlusAdapter {
  private readonly logger = new Logger(ApiProfitPlusAdapter.name);
  /** Where the SKU came from last time, so the log says it once, and again
   * only when it changes. */
  private skuSource: string | undefined;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('PROFIT_PLUS_API_URL', { infer: true }) &&
      this.config.get('PROFIT_PLUS_API_KEY', { infer: true }),
    );
  }

  private requireBaseUrl(): string {
    const url = this.config.get('PROFIT_PLUS_API_URL', { infer: true });
    if (!url) {
      throw new ErpNotConfiguredError(
        'PROFIT_PLUS_API_URL no está configurado — apunta al bridge (profit-plus-bridge-principal) una vez desplegado.',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private requireHeaders(): Record<string, string> {
    const apiKey = this.config.get('PROFIT_PLUS_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ErpNotConfiguredError('PROFIT_PLUS_API_KEY no está configurado.');
    }
    return { Authorization: `Bearer ${apiKey}` };
  }

  /** The SKU comes from a column the bridge looks up in Profit Plus: the
   * log says which, or what columns there were when it found none, or that
   * the store's bridge is too old to send it. */
  private reportSkuSource(data: BridgeResponse): void {
    const source = data.columnaSku === undefined ? 'old-bridge' : (data.columnaSku ?? 'none');
    if (source === this.skuSource) return;
    this.skuSource = source;
    if (source === 'old-bridge') {
      this.logger.warn(
        'El bridge de Profit Plus no envía el SKU: instala la versión 1.2.0 en la PC de la tienda.',
      );
    } else if (source === 'none') {
      this.logger.warn(
        `Profit Plus no tiene el campo Modelo en art: los productos van sin SKU. Columnas: ${(data.columnasArt ?? []).join(', ')}`,
      );
    } else {
      this.logger.log(`Profit Plus: el SKU viene de art.${source} (campo Modelo).`);
    }
  }

  async fetchInventory(): Promise<ErpInventoryItem[]> {
    const res = await fetchBridge(
      `${this.requireBaseUrl()}/api/productos-sincronizacion`,
      { headers: this.requireHeaders() },
      'El bridge de Profit Plus',
    );
    const data = (await res.json()) as BridgeResponse;
    this.reportSkuSource(data);

    return data.productos.map((p) => {
      // Profit Plus guarda código y descripción en columnas char() de ancho
      // fijo: llegan rellenos de espacios (le pasó al bridge secundario), y
      // un SKU con espacios no coincide con el código de barras escaneado
      // ni con la búsqueda. Se limpian aquí aunque el bridge ya lo haga.
      const code = String(p.codigo ?? '').trim();
      // El código de la categoría en Profit es su identidad: si en Profit le
      // cambian el nombre, en la web sigue siendo la misma categoría con el
      // nombre nuevo. Un artículo sin categoría (LEFT JOIN sin match) cae en
      // "Sin categoría", que se crea la primera vez y se reutiliza después;
      // uno con código pero sin descripción se muestra con su código.
      const categoryExternalId = String(p.categoriaCodigo ?? '').trim() || undefined;
      const categoryLabel =
        p.categoria?.trim() ||
        (categoryExternalId ? `Categoría ${categoryExternalId}` : 'Sin categoría');
      // La marca, igual que la categoría: su código es su identidad, y una
      // sin descripción se muestra con su código.
      const brandExternalId = String(p.marcaCodigo ?? '').trim() || undefined;
      const brand = p.marca?.trim() || (brandExternalId ? `Marca ${brandExternalId}` : undefined);
      // La referencia es el código de barras con que la tienda etiqueta el
      // artículo; el código interno (co_art) sigue siendo la identidad,
      // porque es único y nunca está vacío. Sin referencia, se usa el
      // interno. El SKU de la tienda va en el campo Modelo.
      const reference = String(p.referencia ?? '').trim();
      const model = String(p.modelo ?? '').trim() || undefined;
      return {
        externalId: code,
        sku: reference || code,
        model,
        name: String(p.descripcion ?? '').trim(),
        categoryCode: slugify(categoryLabel) || 'sin-categoria',
        categoryLabel,
        categoryExternalId,
        brand,
        brandExternalId,
        // precio1 = tarifa principal (detal), precio2 = segunda tarifa
        // (mayor) — mismo orden que ya asume el resto del catálogo
        // (retailPrice/wholesalePrice).
        retailPrice: Number(p.precio1) || 0,
        wholesalePrice: Number(p.precio2) || 0,
        // Profit Plus admite existencias negativas; en la tienda es agotado.
        stock: Math.max(0, Number(p.stock) || 0),
      };
    });
  }

  /** El bridge (profit-plus-bridge-principal) hoy es solo de lectura: no
   * expone ningún endpoint para escribir una venta en Profit Plus. Hacerlo
   * toca el sistema contable (numeración de factura, movimientos de
   * inventario, impuestos) y hay que definirlo con quien administra Profit
   * Plus. Mientras tanto ErpExportService deja las ventas pendientes, sin
   * marcarlas como reportadas, para enviarlas todas cuando exista. */
  canReportSales(): boolean {
    return false;
  }

  async reportSale(sale: ErpSaleExport): Promise<void> {
    throw new Error(
      `El bridge de Profit Plus todavía no recibe ventas — la venta ${sale.orderId} no se reportó.`,
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = this.config.get('PROFIT_PLUS_API_URL', { infer: true });
      if (!url) return false;
      const res = await fetch(`${url.replace(/\/+$/, '')}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
