import { OrderStatus } from '../../orders/entities/order.entity';

/**
 * The WhatsApp templates customers get their order and quote updates with
 * (see CustomerUpdatesService) — the same moments the customer emails
 * cover, minus "en preparación", which follows the payment almost at once.
 * One template per moment, each naming the order, so Meta files them as
 * utility. Like the admin alert, they live in the sending number's
 * WhatsApp Business account: npm run whatsapp:templates -- <WABA_ID>
 *
 * Bodies start and end with text (Meta rejects a parameter at either end).
 * {{1}} is always the customer's first name, {{2}} the order or quote.
 */
export interface CustomerTemplate {
  name: string;
  body: string;
  example: string[];
  button: {
    text: string;
    /** After the site's address; a trailing {{1}} is filled per message. */
    path: string;
    example?: string;
  };
}

const ORDERS_BUTTON = { text: 'Ver mi pedido', path: '/client/orders' };

export const ORDER_RECEIVED: CustomerTemplate = {
  name: 'pedido_recibido',
  body: 'Hola {{1}}, recibimos tu pedido {{2}} por {{3}} en Electron Plus. Te avisaremos por aquí cada vez que avance.',
  example: ['Ana', '#A1B2C3D4', 'REF 45,50'],
  button: ORDERS_BUTTON,
};

/** The order's statuses that get a message. */
export const ORDER_STATUS_TEMPLATES: Partial<Record<OrderStatus, CustomerTemplate>> = {
  [OrderStatus.PAID]: {
    name: 'pago_confirmado',
    body: 'Hola {{1}}, confirmamos el pago de tu pedido {{2}}. Ya lo estamos preparando.',
    example: ['Ana', '#A1B2C3D4'],
    button: ORDERS_BUTTON,
  },
  [OrderStatus.SHIPPED]: {
    name: 'pedido_enviado',
    body: 'Hola {{1}}, tu pedido {{2}} salió de nuestro depósito y va en camino a tu dirección.',
    example: ['Ana', '#A1B2C3D4'],
    button: ORDERS_BUTTON,
  },
  [OrderStatus.READY_FOR_PICKUP]: {
    name: 'pedido_listo_retiro',
    body: 'Hola {{1}}, tu pedido {{2}} está listo para retirar en nuestra tienda: Calle Sucre, Edificio Leandro, local D, Chacao. Horario: lunes a sábado de 9:00 a. m. a 5:00 p. m.',
    example: ['Ana', '#A1B2C3D4'],
    button: ORDERS_BUTTON,
  },
  [OrderStatus.FULFILLED]: {
    name: 'pedido_entregado',
    body: 'Hola {{1}}, confirmamos la entrega de tu pedido {{2}}. ¡Gracias por comprar en Electron Plus!',
    example: ['Ana', '#A1B2C3D4'],
    button: ORDERS_BUTTON,
  },
  [OrderStatus.CANCELLED]: {
    name: 'pedido_cancelado',
    body: 'Hola {{1}}, tu pedido {{2}} fue cancelado. Si tienes dudas, respóndenos por aquí.',
    example: ['Ana', '#A1B2C3D4'],
    button: ORDERS_BUTTON,
  },
};

export const QUOTE_APPROVED: CustomerTemplate = {
  name: 'cotizacion_aprobada',
  body: 'Hola {{1}}, tu cotización {{2}} fue aprobada. Puedes continuar al pago en la web con el precio acordado.',
  example: ['Ana', '#A1B2C3D4'],
  button: { text: 'Continuar al pago', path: '/checkout?quoteId={{1}}', example: 'abc123' },
};

export const QUOTE_REJECTED: CustomerTemplate = {
  name: 'cotizacion_rechazada',
  body: 'Hola {{1}}, revisamos tu cotización {{2}} y esta vez no pudimos aprobarla. Si tienes dudas, respóndenos por aquí.',
  example: ['Ana', '#A1B2C3D4'],
  button: { text: 'Ver mis cotizaciones', path: '/quotes' },
};

export const CUSTOMER_TEMPLATES: CustomerTemplate[] = [
  ORDER_RECEIVED,
  ...Object.values(ORDER_STATUS_TEMPLATES),
  QUOTE_APPROVED,
  QUOTE_REJECTED,
];

/** The text the customer reads, for the chat's record. */
export function renderTemplate(template: CustomerTemplate, params: string[]): string {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');
}

/** What the Business Management API takes to create it. */
export function customerTemplateDefinition(template: CustomerTemplate, siteUrl: string) {
  const site = siteUrl.replace(/\/$/, '');
  const url = `${site}${template.button.path}`;
  return {
    name: template.name,
    language: 'es',
    category: 'UTILITY',
    components: [
      { type: 'BODY', text: template.body, example: { body_text: [template.example] } },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: template.button.text,
            url,
            ...(template.button.example
              ? { example: [url.replace('{{1}}', template.button.example)] }
              : {}),
          },
        ],
      },
    ],
  };
}
