import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OrderStatus } from '../orders/entities/order.entity';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { StockAlertLevel } from '../inventory/entities/stock-alert.entity';
import { PayableDueStatus } from '../finance/entities/supplier-payable.entity';
import { ExpenseDueStatus } from '../expenses/entities/expense.entity';
import { EMAIL_COLORS, EMAIL_CONTACT, emailFontUrl } from './brand';
import { BRAND_ATTACHMENTS } from './brand-assets';
import { expenseDueEmail } from './templates/expense-due-email';
import { invoiceDueEmail } from './templates/invoice-due-email';
import { orderCreatedEmail } from './templates/order-created-email';
import { orderStatusEmail } from './templates/order-status-email';
import { quoteStatusEmail } from './templates/quote-status-email';
import { stockAlertEmail } from './templates/stock-alert-email';
import { welcomeEmail } from './templates/welcome-email';

const SITE = 'https://electronplus.com.ve';

const order = {
  items: [{ name: 'Cable <i>12</i>', sku: 'CB-12', qty: 2, lineTotal: 90 }],
  subtotal: 90,
  discountAmount: 9,
  discountCode: 'PROMO',
  taxAmount: 12.96,
  shippingCost: 0,
  totalAmount: 93.96,
} as never;

const quote = (status: QuoteStatus, rejectionReason?: string) =>
  ({
    id: 'q1',
    status,
    rejectionReason,
    globalDiscountPct: 5,
    items: [
      {
        id: 'a',
        productId: 'p',
        sku: 'BR-20',
        name: 'Breaker 20A',
        qty: 2,
        unitPrice: 10,
        wholesalePrice: 8,
        discountPct: 0,
      },
    ],
  }) as never;

/** Every email the app can send, rendered with representative data. */
const ALL_EMAILS: Record<string, { subject: string; html: string }> = {
  welcome: welcomeEmail('María', SITE),
  orderCreated: orderCreatedEmail(order, SITE),
  orderPaid: orderStatusEmail(OrderStatus.PAID, SITE)!,
  orderShipped: orderStatusEmail(OrderStatus.SHIPPED, SITE)!,
  orderFulfilled: orderStatusEmail(OrderStatus.FULFILLED, SITE)!,
  orderCancelled: orderStatusEmail(OrderStatus.CANCELLED, SITE)!,
  quoteApproved: quoteStatusEmail(quote(QuoteStatus.APPROVED), SITE)!,
  quoteRejected: quoteStatusEmail(quote(QuoteStatus.REJECTED, 'Muy poca cantidad'), SITE)!,
  stockLow: stockAlertEmail({ sku: 'S', name: 'Foco', level: StockAlertLevel.LOW, stock: 2 }, SITE),
  stockOut: stockAlertEmail({ sku: 'S', name: 'Foco', level: StockAlertLevel.OUT, stock: 0 }, SITE),
  invoiceOverdue: invoiceDueEmail(
    {
      invoiceNumber: 'F-1',
      supplierName: 'Prov',
      dueStatus: PayableDueStatus.OVERDUE,
      dueDate: '2026-10-01',
    },
    SITE,
  ),
  expenseSoon: expenseDueEmail(
    { name: 'Alquiler', dueStatus: ExpenseDueStatus.DUE_SOON, dueDate: '2026-10-05' },
    SITE,
  ),
};

describe.each(Object.entries(ALL_EMAILS))('email "%s"', (_name, { subject, html }) => {
  it('has a subject and uses the shared brand layout', () => {
    expect(subject.length).toBeGreaterThan(0);
    expect(html).toContain(`background-color:${EMAIL_COLORS.blue}`);
    expect(html).toContain(emailFontUrl(SITE));
  });

  it('carries none of the old styling (previous blue, navy chrome, stale hours)', () => {
    expect(html.toLowerCase()).not.toContain('#0056b3');
    expect(html.toLowerCase()).not.toContain('#0b2545');
    expect(html).not.toContain('8am');
  });

  it('shows the current contact details in the footer', () => {
    expect(html).toContain(EMAIL_CONTACT.hours);
    expect(html).toContain(EMAIL_CONTACT.whatsappHref);
    expect(html).toContain(`mailto:${EMAIL_CONTACT.email}`);
  });

  it('only references inline images that are actually attached, and attaches only what it uses', () => {
    const referenced = new Set([...html.matchAll(/cid:([\w-]+)/g)].map((m) => m[1]));
    const attached = new Set(BRAND_ATTACHMENTS.map((a) => a.contentId));
    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) expect(attached).toContain(id);
    for (const id of attached) expect(referenced).toContain(id);
  });
});

describe('email content safety', () => {
  it('escapes user-supplied text in the body and in the hidden preview text', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { html } = quoteStatusEmail(quote(QuoteStatus.REJECTED, evil), SITE)!;
    expect(html).not.toContain(evil);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes product names in order lines and alert previews', () => {
    expect(orderCreatedEmail(order, SITE).html).not.toContain('<i>12</i>');
    const { html } = stockAlertEmail(
      { sku: 'S', name: '<script>x</script>', level: StockAlertLevel.OUT, stock: 0 },
      SITE,
    );
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('email brand stays in sync with the storefront', () => {
  const frontend = (file: string) => join(__dirname, '../../../frontend/src/lib', file);
  const hasFrontend = existsSync(frontend('contact-info.ts'));
  const maybe = hasFrontend ? it : it.skip;

  maybe('contact details match frontend/src/lib/contact-info.ts', () => {
    const src = readFileSync(frontend('contact-info.ts'), 'utf8');
    const field = (key: string) => new RegExp(`${key}:\\s*"([^"]+)"`).exec(src)?.[1];
    expect(EMAIL_CONTACT.phone).toBe(field('phone'));
    expect(EMAIL_CONTACT.whatsappHref).toBe(field('whatsappHref'));
    expect(EMAIL_CONTACT.email).toBe(field('email'));
    expect(EMAIL_CONTACT.hours).toBe(field('hours'));
  });

  maybe('brand blue matches frontend/src/lib/brand-colors.ts', () => {
    const src = readFileSync(frontend('brand-colors.ts'), 'utf8');
    expect(/BRAND_BLUE_HEX\s*=\s*"([^"]+)"/.exec(src)?.[1]?.toLowerCase()).toBe(EMAIL_COLORS.blue);
  });
});
