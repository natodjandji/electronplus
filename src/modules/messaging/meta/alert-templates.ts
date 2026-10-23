import type { WhatsappTemplate } from './whatsapp-template';

/**
 * The templates the panel's alerts reach the admins' WhatsApp with (see
 * AdminAlertsService): one per kind of alert, whose text is the
 * notification itself — the title in bold, then what happened. A template
 * can't be parameters alone: Meta rejects one that starts or ends with a
 * parameter (a closing period doesn't count) or has few words per
 * parameter, so each ends with a few fixed words of its own. Meta files
 * one as marketing when it reads like product news (an item running out),
 * and an approved template's category can't change, so those are worded as
 * the account updates they are ("el inventario de tu cuenta registró…").
 * The button opens the panel page the alert is about.
 */

const panel = (text: string, page: string) => ({ text, path: `/admin/${page}` });

export const STOCK_OUT: WhatsappTemplate = {
  name: 'alerta_inventario_agotado',
  body: '*Producto agotado*\nEl inventario de tu cuenta registró 0 existencias del artículo {{1}} en su último movimiento.',
  example: ['Bombillo LED 9W (LED-9W)'],
  button: panel('Ver inventario', 'stock'),
};

export const STOCK_LOW: WhatsappTemplate = {
  name: 'alerta_inventario_bajo',
  body: '*Stock bajo*\nEl inventario de tu cuenta registró {{1}} existencias del artículo {{2}}, por debajo del mínimo configurado.',
  example: ['3', 'Breaker 20A (BRK-20)'],
  button: panel('Ver inventario', 'stock'),
};

export const STOCK_GROUPED: WhatsappTemplate = {
  name: 'alerta_inventario_varios',
  body: '*Alertas de stock*\n{{1}}\nEl inventario de tu cuenta registró {{2}} artículos agotados o por debajo del mínimo configurado.',
  example: ['Bombillo LED 9W (LED-9W): agotado · Breaker 20A (BRK-20): quedan 3', '2'],
  button: panel('Ver inventario', 'stock'),
};

export const INVOICE_DUE_SOON: WhatsappTemplate = {
  name: 'alerta_factura_por_vencer',
  body: '*Factura por vencer*\nLa factura {{1}} de {{2}} vence el {{3}} y sigue pendiente de pago.',
  example: ['F-0012', 'Distribuidora Andina', '2026-10-30'],
  button: panel('Ver compras', 'purchases'),
};

export const INVOICE_OVERDUE: WhatsappTemplate = {
  name: 'alerta_factura_vencida',
  body: '*Factura vencida*\nLa factura {{1}} de {{2}} venció el {{3}} y sigue pendiente de pago.',
  example: ['F-0012', 'Distribuidora Andina', '2026-10-20'],
  button: panel('Ver compras', 'purchases'),
};

/** Replaces alerta_gasto_por_vencer, which Meta filed as marketing. */
export const EXPENSE_DUE_SOON: WhatsappTemplate = {
  name: 'alerta_gasto_proximo',
  body: '*Gasto por vencer*\nRecordatorio de pago: el gasto {{1}} registrado en tu cuenta vence el {{2}} y sigue pendiente.',
  example: ['Alquiler del local', '2026-10-30'],
  button: panel('Ver gastos', 'expenses'),
};

export const EXPENSE_OVERDUE: WhatsappTemplate = {
  name: 'alerta_gasto_vencido',
  body: '*Gasto vencido*\nEl gasto {{1}} venció el {{2}} y sigue pendiente de pago.',
  example: ['Alquiler del local', '2026-10-20'],
  button: panel('Ver gastos', 'expenses'),
};

export const REVIEW_NEW: WhatsappTemplate = {
  name: 'alerta_resena_nueva',
  body: '*Reseña nueva*\n{{1}}\n{{2}} calificó la atención con {{3}} de 5 estrellas.',
  example: ['"Muy buena atención" · Atendió Pedro', 'Luis (0412-5550000)', '4'],
  button: panel('Ver reseñas', 'reviews'),
};

export const REVIEW_TO_HANDLE: WhatsappTemplate = {
  name: 'alerta_resena_baja',
  body: '*Reseña para atender*\n{{1}}\nEl formulario de reseñas de tu tienda registró la calificación de {{2}} con {{3}} de 5 estrellas.',
  example: ['"Me atendieron tarde"', 'Luis (0412-5550000)', '1'],
  button: panel('Ver reseñas', 'reviews'),
};

export const CUSTOMER_WAITING: WhatsappTemplate = {
  name: 'alerta_cliente_esperando',
  body: '*Cliente esperando*\n{{1}}: {{2}}\nEscribió por {{3}} y espera a un asesor.',
  example: ['María', 'Quiere pagar en efectivo al retirar', 'WhatsApp'],
  button: panel('Ver conversaciones', 'conversations'),
};

export const ORDER_NEW: WhatsappTemplate = {
  name: 'alerta_pedido_nuevo',
  body: '*Pedido nuevo*\n{{1}}\nEl total del pedido es {{2}}, con IVA y envío incluidos.',
  example: ['Ana Pérez · 3 productos · Pago móvil · Envío a Chacao, Miranda', 'REF 45,50'],
  button: panel('Ver pedidos', 'orders'),
};

export const SYNC_ERROR: WhatsappTemplate = {
  name: 'alerta_error_profit',
  body: '*Error de sincronización con Profit Plus*\n{{1}}\nLa próxima sincronización lo volverá a intentar.',
  example: ['El bridge no respondió'],
  button: panel('Ver sincronización', 'settings?tab=erp-sync'),
};

export const TEST_ALERT: WhatsappTemplate = {
  name: 'alerta_prueba_numero',
  body: '*Alerta de prueba*\nConfirmación de configuración: este número recibe las alertas de tu cuenta del panel de Electron Plus.',
  example: [],
  button: panel('Abrir el panel', 'conversations'),
};

export const ALERT_TEMPLATES: WhatsappTemplate[] = [
  STOCK_OUT,
  STOCK_LOW,
  STOCK_GROUPED,
  INVOICE_DUE_SOON,
  INVOICE_OVERDUE,
  EXPENSE_DUE_SOON,
  EXPENSE_OVERDUE,
  REVIEW_NEW,
  REVIEW_TO_HANDLE,
  CUSTOMER_WAITING,
  ORDER_NEW,
  SYNC_ERROR,
  TEST_ALERT,
];

/** How much room the parameters of one alert share: the body is capped at
 * 1024 characters with its fixed words. */
export const ALERT_PARAMS_BUDGET = 900;
