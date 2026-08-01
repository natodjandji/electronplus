import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.validation';
import { slugify } from '../../../common/utils/slug';
import {
  ErpInventoryItem,
  ErpSaleExport,
  ProfitPlusAdapter,
} from './profit-plus-adapter.interface';

interface BridgeProduct {
  codigo: string;
  descripcion: string;
  categoria: string | null;
  stock: number;
  precio1: number;
  precio2: number;
}

interface BridgeResponse {
  total: number;
  productos: BridgeProduct[];
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
 * of a confusing fetch failure if PROFIT_PLUS_ADAPTER=api gets set before
 * the URL/key are filled in.
 */
@Injectable()
export class ApiProfitPlusAdapter implements ProfitPlusAdapter {
  private readonly logger = new Logger(ApiProfitPlusAdapter.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private requireBaseUrl(): string {
    const url = this.config.get('PROFIT_PLUS_API_URL', { infer: true });
    if (!url) {
      throw new Error(
        'PROFIT_PLUS_API_URL no está configurado — apunta al bridge (profit-plus-bridge-principal) una vez desplegado.',
      );
    }
    return url.replace(/\/+$/, '');
  }

  private requireHeaders(): Record<string, string> {
    const apiKey = this.config.get('PROFIT_PLUS_API_KEY', { infer: true });
    if (!apiKey) {
      throw new Error('PROFIT_PLUS_API_KEY no está configurado.');
    }
    return { Authorization: `Bearer ${apiKey}` };
  }

  async fetchInventory(): Promise<ErpInventoryItem[]> {
    const res = await fetch(`${this.requireBaseUrl()}/api/productos-sincronizacion`, {
      headers: this.requireHeaders(),
    });
    if (!res.ok) {
      throw new Error(`El bridge de Profit Plus respondió ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as BridgeResponse;

    return data.productos.map((p) => {
      // El bridge puede devolver categoria=null (LEFT JOIN sin match) —
      // CategoriesService.findOrCreateByCode ya crea "Sin categoría" la
      // primera vez y la reutiliza después, mismo mecanismo que cualquier
      // categoría real.
      const categoryLabel = p.categoria?.trim() || 'Sin categoría';
      return {
        externalId: p.codigo,
        sku: p.codigo,
        name: p.descripcion,
        categoryCode: slugify(categoryLabel) || 'sin-categoria',
        categoryLabel,
        // precio1 = tarifa principal (detal), precio2 = segunda tarifa
        // (mayor) — mismo orden que ya asume el resto del catálogo
        // (retailPrice/wholesalePrice).
        retailPrice: p.precio1,
        wholesalePrice: p.precio2,
        stock: p.stock,
      };
    });
  }

  async reportSale(sale: ErpSaleExport): Promise<void> {
    // El bridge (profit-plus-bridge-principal) hoy es solo de lectura — no
    // expone ningún endpoint para escribir una venta de vuelta en Profit
    // Plus. Reportar una venta implica tocar el sistema contable
    // (numeración de factura, movimientos de inventario, impuestos), y eso
    // hay que definirlo junto con quien administra Profit Plus antes de
    // automatizarlo — no es algo para improvisar acá. Se deja como no-op
    // (loggeado, no lanza error) para que activar PROFIT_PLUS_ADAPTER=api
    // no dispare 5 reintentos + una notificación de error por cada venta
    // pagada mientras esa mitad de la integración no exista.
    this.logger.warn(
      `reportSale no implementado todavía — la venta ${sale.orderId} no se reportó a Profit Plus (falta definir el endpoint de escritura en el bridge).`,
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
