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
  /** Each of the article's cost columns in Profit Plus, by its name in art
   * (ult_cos_un, cos_pro_un…); 0 when empty. Absent from bridges before
   * 1.3.0. */
  costos?: Record<string, number | string | null>;
}

interface BridgeResponse {
  total: number;
  productos: BridgeProduct[];
  /** The art column the bridge found the SKU in (the Modelo field); null
   * when it found none, absent from bridges before 1.2.0. */
  columnaSku?: string | null;
  /** The art columns the costs came from; absent from bridges before 1.3.0. */
  columnasCosto?: string[];
  /** All of art's columns, sent when it found no SKU or no cost column: to
   * see what they're called. */
  columnasArt?: string[];
}

/**
 * Profit Plus's cost columns, in the order the web takes them: the last cost
 * (of the last purchase or stock entry), then the average one when the last
 * is empty. Both are in the company's own currency, the one its prices are
 * in. The bridge sends every cost column it finds, so a different one (the
 * other-currency ult_cos_om, say) is picked here, without touching the
 * store's PC.
 */
const COST_COLUMNS = ['ult_cos_un', 'cos_pro_un'];
/** Cost lists in a log line, at most. */
const LOGGED_EXAMPLES = 10;

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
  /** The same for the cost, and for what the last run's costs looked like. */
  private costSource: string | undefined;
  private costSummary: string | undefined;

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
        'El bridge de Profit Plus no envía el SKU ni los costos: instala la versión 1.3.0 en la PC de la tienda.',
      );
    } else if (source === 'none') {
      this.logger.warn(
        `Profit Plus no tiene el campo Modelo en art: los productos van sin SKU. Columnas: ${(data.columnasArt ?? []).join(', ')}`,
      );
    } else {
      this.logger.log(`Profit Plus: el SKU viene de art.${source} (campo Modelo).`);
    }
  }

  /** The cost columns to read, in COST_COLUMNS' order, as the bridge names
   * them. Undefined when there's no cost to take: a bridge from before
   * 1.3.0, or a Profit Plus without these columns. Then every product keeps
   * the cost it has, instead of losing it. Logged once, and again on a
   * change, like the SKU's. */
  private costColumnsOf(data: BridgeResponse): string[] | undefined {
    const sent = data.columnasCosto;
    const columns = (sent ?? [])
      .filter((name) => COST_COLUMNS.includes(name.toLowerCase()))
      .sort(
        (a, b) => COST_COLUMNS.indexOf(a.toLowerCase()) - COST_COLUMNS.indexOf(b.toLowerCase()),
      );
    const source = sent === undefined ? 'old-bridge' : columns.join(',') || 'none';
    if (source !== this.costSource) {
      this.costSource = source;
      if (source === 'old-bridge') {
        // One from before 1.2.0 sends no SKU either, and reportSkuSource()
        // has already asked for 1.3.0.
        if (data.columnaSku !== undefined) {
          this.logger.warn(
            'El bridge de Profit Plus no envía los costos: instala la versión 1.3.0 en la PC de la tienda.',
          );
        }
      } else if (source === 'none') {
        this.logger.warn(
          `Profit Plus no tiene las columnas de costo ${COST_COLUMNS.join(' ni ')} en art: los productos quedan con el costo que tenían. Columnas de costo: ${sent!.join(', ') || 'ninguna'}${data.columnasArt ? `. Columnas de art: ${data.columnasArt.join(', ')}` : ''}`,
        );
      } else {
        const [first, ...fallbacks] = columns;
        this.logger.log(
          `Profit Plus: el costo viene de art.${first}${fallbacks.length ? `, o de art.${fallbacks.join(', art.')} si está en 0` : ''}.`,
        );
      }
    }
    return columns.length ? columns : undefined;
  }

  /** The first of `columns` with a cost above 0, or null: no cost in Profit. */
  private costOf(product: BridgeProduct, columns: string[]): number | null {
    for (const column of columns) {
      const value = Number(product.costos?.[column]);
      if (value > 0) return value;
    }
    return null;
  }

  /** How many articles have a cost, and how many cost more than they sell
   * for at retail, which almost always means a cost in the other currency.
   * Logged when it changes, so loading costs in Profit shows up here. */
  private reportCosts(items: ErpInventoryItem[]): void {
    const costed = items.filter((item) => item.cost);
    const above = costed.filter((item) => item.retailPrice > 0 && item.cost! > item.retailPrice);
    const summary = `${costed.length}/${items.length}/${above.map((i) => i.externalId).join(',')}`;
    if (summary === this.costSummary) return;
    this.costSummary = summary;
    this.logger.log(`Profit Plus: ${costed.length} de ${items.length} artículos tienen costo.`);
    if (above.length) {
      const examples = above
        .slice(0, LOGGED_EXAMPLES)
        .map((item) => `${item.externalId} (costo ${item.cost}, detal ${item.retailPrice})`)
        .join(', ');
      this.logger.warn(
        `Profit Plus: ${above.length} artículos cuestan más de lo que se venden al detal: ${examples}${above.length > LOGGED_EXAMPLES ? ', …' : ''}. Revisa en Profit que el costo esté en la misma moneda que los precios.`,
      );
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
    const costColumns = this.costColumnsOf(data);

    const items = data.productos.map((p): ErpInventoryItem => {
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
        // Profit Plus owns the cost like the prices: one emptied there is
        // emptied here (null). Undefined leaves it as it is.
        cost: costColumns ? this.costOf(p, costColumns) : undefined,
      };
    });
    if (costColumns) this.reportCosts(items);
    return items;
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
