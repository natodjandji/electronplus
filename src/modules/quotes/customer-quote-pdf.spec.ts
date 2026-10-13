import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../../common/enums/role.enum';
import { renderQuotePdf } from '../../common/pdf/quote-pdf';
import { Collections } from '../../firebase/firestore-collections';
import { FakeFirestore } from '../../test/fake-firestore';
import { PaymentMethod } from '../payments/entities/payment.entity';
import { customerQuotePdf } from './customer-quote-pdf';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuotePdfService } from './quote-pdf.service';
import { QuotesService } from './quotes.service';

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q1abcdef99',
    userId: 'client-1',
    customerName: 'Ferretería El Sol',
    customerTaxId: 'J-123',
    status: QuoteStatus.APPROVED,
    expectedPaymentMethod: PaymentMethod.PAGO_MOVIL,
    globalDiscountPct: 5,
    items: [
      {
        id: 'l1',
        productId: 'a',
        sku: 'A',
        name: 'Breaker',
        qty: 2,
        unitPrice: 10,
        wholesalePrice: 8,
        discountPct: 10,
      },
      {
        id: 'l2',
        productId: 'b',
        sku: 'B',
        name: 'Cable',
        qty: 1,
        unitPrice: 5,
        wholesalePrice: 4,
        discountPct: 0,
      },
    ],
    createdAt: new Date('2026-10-10T15:00:00Z'),
    updatedAt: new Date('2026-10-10T15:00:00Z'),
    ...overrides,
  };
}

describe('customerQuotePdf', () => {
  it('totals what checkout charges: line discounts, special discount, then IVA', () => {
    const pdf = customerQuotePdf(quote(), 200);
    expect(pdf.lines.map((l) => [l.lineTotal, l.note])).toEqual([
      [18, 'Descuento 10%'],
      [5, undefined],
    ]);
    expect(pdf.totalRows).toEqual([
      { label: 'Subtotal', amount: 23 },
      { label: 'Descuento especial (5%)', amount: -1.15 },
      { label: 'Base imponible', amount: 21.85 },
      { label: 'IVA (16%)', amount: 3.5 },
    ]);
    // OrdersService.createFromQuote: 10·0.9·0.95·2 + 5·0.95 = 21.85, plus 16%.
    expect(pdf.total).toBe(25.35);
    expect(pdf.totalNotes).toEqual(['Total al mayor de referencia (sin IVA): REF 20,00']);
  });

  it('shows the status, the payment method and terms that fit it', () => {
    const pdf = customerQuotePdf(
      quote({ status: QuoteStatus.SENT, globalDiscountPct: 0 }),
      undefined,
    );
    expect(pdf.numberLabel).toBe('Q1ABCDEF');
    expect(pdf.headerLines[1]).toEqual({ text: 'Estado: En revisión', strong: true });
    expect(pdf.parties[0].lines).toEqual(['RIF/C.I.: J-123', 'Pago previsto: Pago móvil']);
    expect(pdf.totalRows.map((r) => r.label)).not.toContain('Descuento especial (0%)');
    expect(pdf.terms.join(' ')).toMatch(/en revisión/);
    expect(pdf.terms.join(' ')).toMatch(/envío/);
    expect(pdf.bcv).toBeUndefined();
  });

  it('renders a PDF', async () => {
    const buffer = await renderQuotePdf(customerQuotePdf(quote(), 200));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('QuotePdfService', () => {
  const owner = { id: 'client-1', email: 'c@x.test', role: Role.CLIENT };
  const stranger = { id: 'client-2', email: 'd@x.test', role: Role.CLIENT };
  const admin = { id: 'admin-1', email: 'a@x.test', role: Role.ADMIN };

  function build() {
    const firestore = new FakeFirestore();
    const { id: _id, ...data } = quote();
    firestore.seed(Collections.QUOTES, 'q1abcdef99', data);
    const quotes = new QuotesService(
      firestore as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
    );
    const exchange = { getBcvRate: () => Promise.resolve({ rate: 200 }) };
    return {
      firestore,
      service: new QuotePdfService(firestore as never, quotes, exchange as never),
    };
  }

  it('gives the owner (or an admin) one stable link, and nobody else', async () => {
    const { service } = build();
    const { token } = await service.pdfLink('q1abcdef99', owner);
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect((await service.pdfLink('q1abcdef99', admin)).token).toBe(token);
    await expect(service.pdfLink('q1abcdef99', stranger)).rejects.toThrow(ForbiddenException);
  });

  it('serves the PDF by its link only', async () => {
    const { service } = build();
    const { token } = await service.pdfLink('q1abcdef99', owner);
    const { label, pdf } = await service.pdfByToken(token);
    expect(label).toBe('Q1ABCDEF');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(service.pdfByToken('A'.repeat(24))).rejects.toThrow(NotFoundException);
    await expect(service.pdfByToken('../x')).rejects.toThrow(NotFoundException);
  });
});
