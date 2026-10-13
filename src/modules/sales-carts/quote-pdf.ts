import { readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { EMAIL_COLORS as COLOR, EMAIL_CONTACT as CONTACT } from '../email/brand';
import { PriceList } from './entities/sales-cart.entity';
import { SharedQuote } from './entities/shared-quote.entity';

type Doc = InstanceType<typeof PDFDocument>;
export type QuoteForPdf = Omit<SharedQuote, 'cartId'>;

/** US Letter, in points. */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 30;
/** Lowest y the body may reach; the footer lives below it. */
const BODY_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const TIME_ZONE = 'America/Caracas';

const PRICE_LIST_LABEL: Record<PriceList, string> = {
  [PriceList.RETAIL]: 'Precio detal',
  [PriceList.WHOLESALE]: 'Precio al mayor',
};

/** The table's columns; widths add up to CONTENT_WIDTH. */
const COLUMNS = [
  { title: '#', width: 26, align: 'center' },
  { title: 'Código', width: 78, align: 'left' },
  { title: 'Descripción', width: 216, align: 'left' },
  { title: 'Cant.', width: 44, align: 'right' },
  { title: 'Precio unit.', width: 74, align: 'right' },
  { title: 'Total', width: 78, align: 'right' },
] as const;
const CELL_PAD = 6;

let logo: Buffer | undefined;
/** Same file the storefront shows (frontend/public/assets/brand/
 * logo-full-color.svg), rasterized: PDFKit doesn't draw SVG. */
const logoPng = () => (logo ??= readFileSync(join(__dirname, 'assets', 'logo-color.png')));

const amount = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 });
const ref = (n: number) => `REF ${amount.format(n)}`;
const bolivares = (n: number) => `Bs. ${amount.format(n)}`;
const longDate = (d: Date) =>
  d.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
const shortDate = (d: Date) => d.toLocaleDateString('es-VE', { timeZone: TIME_ZONE });

export const quoteNumberLabel = (n: number) => String(n).padStart(6, '0');

/**
 * A shared quote as a letter-size PDF — the document the customer keeps and
 * the seller prints, laid out the same on any device (printing the web page
 * from a phone scaled the phone layout onto the sheet). Text is real text,
 * long product lists flow onto more pages with the table header repeated,
 * and every page carries the page count.
 */
export function renderQuotePdf(quote: QuoteForPdf): Promise<Buffer> {
  const number = quoteNumberLabel(quote.number);
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Cotización N.º ${number} · Electron Plus`,
      Author: 'Electron Plus',
      Subject: 'Cotización',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = drawHeader(doc, quote, number);
  y = drawParties(doc, quote, y + 18);
  y = drawLines(doc, quote, y + 18);
  y = drawTotals(doc, quote, y + 14);
  drawTerms(doc, quote, y + 18);
  drawFooters(doc);

  doc.end();
  return finished;
}

function drawHeader(doc: Doc, quote: QuoteForPdf, number: string): number {
  const logoWidth = 150;
  doc.image(logoPng(), MARGIN, MARGIN, { width: logoWidth });

  let left = MARGIN + 42;
  doc.font(FONT).fontSize(8.5).fillColor(COLOR.muted);
  for (const line of [`Tel. ${CONTACT.phone}`, CONTACT.email, CONTACT.hours]) {
    doc.text(line, MARGIN, left, { width: 240, lineBreak: false });
    left += 12;
  }

  const right = { x: MARGIN, width: CONTENT_WIDTH, align: 'right' as const };
  let top = MARGIN - 2;
  doc
    .font(BOLD)
    .fontSize(9)
    .fillColor(COLOR.blue)
    .text('COTIZACIÓN', right.x, top, { ...right, characterSpacing: 1.5 });
  top += 13;
  doc.font(BOLD).fontSize(20).fillColor(COLOR.navy).text(`N.º ${number}`, right.x, top, right);
  top += 26;
  doc
    .font(FONT)
    .fontSize(8.5)
    .fillColor(COLOR.muted)
    .text(`Emitida el ${longDate(quote.issuedAt)}`, right.x, top, right);
  top += 12;
  doc
    .font(BOLD)
    .fillColor(COLOR.navy)
    .text(`Válida hasta el ${longDate(quote.validUntil)}`, right.x, top, right);
  top += 12;

  const ruleY = Math.max(left, top) + 10;
  doc.rect(MARGIN, ruleY, CONTENT_WIDTH, 3).fill(COLOR.yellow);
  return ruleY + 3;
}

/** Who the quote is for and who made it, side by side. */
function drawParties(doc: Doc, quote: QuoteForPdf, y: number): number {
  const gap = 12;
  const boxWidth = (CONTENT_WIDTH - gap) / 2;
  const customer = quote.customer ?? {};
  const boxes: { title: string; heading: string; muted?: boolean; lines: string[] }[] = [
    {
      title: 'CLIENTE',
      heading: customer.name || 'No indicado',
      muted: !customer.name,
      lines: [
        customer.taxId ? `RIF/C.I.: ${customer.taxId}` : '',
        customer.phone ? `Tel.: ${customer.phone}` : '',
      ].filter(Boolean),
    },
    {
      title: 'ATENDIDO POR',
      heading: quote.sellerName,
      lines: [PRICE_LIST_LABEL[quote.priceList], 'Montos en REF (dólares de referencia)'],
    },
  ];

  const pad = 12;
  const inner = boxWidth - pad * 2;
  const heightOf = (box: (typeof boxes)[number]) => {
    doc.font(BOLD).fontSize(11);
    let h = 12 + doc.heightOfString(box.heading, { width: inner }) + 4;
    doc.font(FONT).fontSize(9);
    for (const line of box.lines) h += doc.heightOfString(line, { width: inner }) + 2;
    return h + pad * 2;
  };
  const height = Math.max(...boxes.map(heightOf));

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (boxWidth + gap);
    doc.roundedRect(x, y, boxWidth, height, 6).fill(COLOR.surface);
    let cy = y + pad;
    doc
      .font(BOLD)
      .fontSize(7.5)
      .fillColor(COLOR.blue)
      .text(box.title, x + pad, cy, { width: inner, characterSpacing: 1 });
    cy += 12;
    doc
      .font(BOLD)
      .fontSize(11)
      .fillColor(box.muted ? COLOR.muted : COLOR.navy)
      .text(box.heading, x + pad, cy, {
        width: inner,
      });
    cy = doc.y + 4;
    doc.font(FONT).fontSize(9).fillColor(COLOR.muted);
    for (const line of box.lines) {
      doc.text(line, x + pad, cy, { width: inner });
      cy = doc.y + 2;
    }
  });
  return y + height;
}

function drawTableHeader(doc: Doc, y: number): number {
  const height = 22;
  doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill(COLOR.blue);
  let x = MARGIN;
  doc.font(BOLD).fontSize(8.5).fillColor(COLOR.white);
  for (const col of COLUMNS) {
    doc.text(col.title, x + CELL_PAD, y + 7, {
      width: col.width - CELL_PAD * 2,
      align: col.align,
      lineBreak: false,
    });
    x += col.width;
  }
  return y + height;
}

/** One row per product; a row that won't fit starts a new page, which
 * gets the table header again. */
function drawLines(doc: Doc, quote: QuoteForPdf, y: number): number {
  y = drawTableHeader(doc, y);
  doc.font(FONT).fontSize(9);

  quote.lines.forEach((line, index) => {
    const cells = [
      String(index + 1),
      line.sku,
      line.name,
      String(line.qty),
      ref(line.unitPrice),
      ref(line.lineTotal),
    ];
    const textHeight = Math.max(
      ...cells.map((cell, c) =>
        doc.heightOfString(cell, { width: COLUMNS[c].width - CELL_PAD * 2 }),
      ),
    );
    const height = textHeight + CELL_PAD * 2;

    if (y + height > BODY_BOTTOM) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN);
      doc.font(FONT).fontSize(9);
    }
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill(COLOR.surface);

    let x = MARGIN;
    cells.forEach((cell, c) => {
      const col = COLUMNS[c];
      doc
        .font(c === 5 ? BOLD : FONT)
        .fillColor(c === 0 ? COLOR.muted : COLOR.navy)
        .text(cell, x + CELL_PAD, y + CELL_PAD, {
          width: col.width - CELL_PAD * 2,
          align: col.align,
        });
      x += col.width;
    });
    y += height;
  });

  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.75)
    .strokeColor(COLOR.border)
    .stroke();
  return y;
}

/** Totals on the right, the QR back to the online quote on the left. */
function drawTotals(doc: Doc, quote: QuoteForPdf, y: number): number {
  const rows: [string, string][] = [['Subtotal', ref(quote.subtotal)]];
  if (quote.discountPct > 0) {
    rows.push([
      `Descuento (${percent.format(quote.discountPct)}%)`,
      `-${ref(quote.discountAmount)}`,
    ]);
  }
  rows.push(['Base imponible', ref(quote.taxableBase)], ['IVA (16%)', ref(quote.taxAmount)]);

  const rowHeight = 16;
  const totalHeight = 28;
  const blockHeight = rows.length * rowHeight + 6 + totalHeight + (quote.bcvRate ? 30 : 0);
  if (y + Math.max(blockHeight, 96) > BODY_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  const width = 236;
  const x = MARGIN + CONTENT_WIDTH - width;
  let cy = y;
  for (const [label, value] of rows) {
    doc
      .font(FONT)
      .fontSize(9.5)
      .fillColor(COLOR.muted)
      .text(label, x, cy, { width, lineBreak: false });
    doc.fillColor(COLOR.navy).text(value, x, cy, { width, align: 'right', lineBreak: false });
    cy += rowHeight;
  }
  cy += 6;
  doc.roundedRect(x, cy, width, totalHeight, 4).fill(COLOR.blue);
  doc
    .font(BOLD)
    .fontSize(12)
    .fillColor(COLOR.white)
    .text('TOTAL', x + 12, cy + 8, { width: width - 24, lineBreak: false });
  doc.text(ref(quote.total), x + 12, cy + 8, {
    width: width - 24,
    align: 'right',
    lineBreak: false,
  });
  cy += totalHeight;
  if (quote.bcvRate) {
    cy += 7;
    doc
      .font(BOLD)
      .fontSize(8.5)
      .fillColor(COLOR.navy)
      .text(`Equivale a ${bolivares(quote.total * quote.bcvRate)}`, x, cy, {
        width,
        align: 'right',
        lineBreak: false,
      });
    cy += 12;
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(
        `Tasa BCV del ${shortDate(quote.issuedAt)}: ${bolivares(quote.bcvRate)} por USD`,
        x,
        cy,
        { width, align: 'right', lineBreak: false },
      );
    cy += 11;
  }

  const qr = quote.qrImageDataUrl?.split(',')[1];
  if (qr) {
    const size = 78;
    doc.image(Buffer.from(qr, 'base64'), MARGIN, y, { width: size, height: size });
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text('Escanea el código para ver esta cotización en línea.', MARGIN + size + 10, y + 26, {
        width: 150,
      });
    cy = Math.max(cy, y + size);
  }
  return cy;
}

function drawTerms(doc: Doc, quote: QuoteForPdf, y: number): void {
  const terms = [
    'Precios unitarios en REF (dólares de referencia), sin IVA; el IVA (16%) se suma en el total.',
    'El pago en bolívares se calcula a la tasa BCV del día del pago.',
    `Cotización válida hasta el ${longDate(quote.validUntil)}, sujeta a disponibilidad de inventario.`,
    'Este documento no es una factura.',
  ];
  doc.font(FONT).fontSize(8.5);
  const height =
    14 + terms.reduce((h, t) => h + doc.heightOfString(t, { width: CONTENT_WIDTH - 12 }) + 3, 0);
  if (y + height > BODY_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }
  doc
    .font(BOLD)
    .fontSize(7.5)
    .fillColor(COLOR.blue)
    .text('CONDICIONES', MARGIN, y, { characterSpacing: 1 });
  let cy = y + 14;
  doc.font(FONT).fontSize(8.5).fillColor(COLOR.muted);
  for (const term of terms) {
    doc.text('•', MARGIN, cy, { width: 10, lineBreak: false });
    doc.text(term, MARGIN + 12, cy, { width: CONTENT_WIDTH - 12 });
    cy = doc.y + 3;
  }
}

/** Company line and "Página n de N" on every page. Drawn last, once the
 * page count is known; the bottom margin is lifted while drawing so text
 * below it doesn't spill onto a new page. */
function drawFooters(doc: Doc): void {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const lineY = PAGE_HEIGHT - MARGIN - 14;
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(MARGIN + CONTENT_WIDTH, lineY)
      .lineWidth(0.5)
      .strokeColor(COLOR.border)
      .stroke();
    doc
      .font(FONT)
      .fontSize(7.5)
      .fillColor(COLOR.muted)
      .text(`Electron Plus · ${CONTACT.email} · ${CONTACT.phone}`, MARGIN, lineY + 6, {
        width: CONTENT_WIDTH,
        lineBreak: false,
      });
    doc.text(`Página ${i - start + 1} de ${count}`, MARGIN, lineY + 6, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
}
