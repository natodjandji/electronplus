import { readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { EMAIL_COLORS as COLOR, EMAIL_CONTACT as CONTACT } from '../../modules/email/brand';

type Doc = InstanceType<typeof PDFDocument>;

/** A box under the header: who the quote is for, who made it, its terms. */
export interface QuotePdfParty {
  title: string;
  heading: string;
  /** Heading in muted gray — e.g. "No indicado" for a missing name. */
  muted?: boolean;
  lines: string[];
}

export interface QuotePdfLine {
  sku: string;
  name: string;
  /** Small text under the name, e.g. a line discount. */
  note?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Everything a quote sheet shows, already decided by the caller — the seller
 * tool's shared quotes and the customers' own quotes both print through
 * this, so they look the same.
 */
export interface QuotePdf {
  /** PDF metadata title. */
  title: string;
  /** Shown as "N.º {numberLabel}". */
  numberLabel: string;
  /** Right-aligned under the number: dates, status. */
  headerLines: { text: string; strong?: boolean }[];
  parties: [QuotePdfParty, QuotePdfParty];
  lines: QuotePdfLine[];
  /** Rows above the TOTAL band; a negative amount prints as a deduction. */
  totalRows: { label: string; amount: number }[];
  total: number;
  /** Extra right-aligned lines under the total. */
  totalNotes?: string[];
  /** Bolivar equivalent of the total. */
  bcv?: { rate: number; date: Date };
  /** QR back to the quote online, beside the totals. */
  qr?: { png: Buffer; caption: string };
  terms: string[];
}

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

/** The table's columns; widths add up to CONTENT_WIDTH. */
const COLUMNS = [
  { title: '#', width: 26, align: 'center' },
  { title: 'Código', width: 78, align: 'left' },
  { title: 'Descripción', width: 216, align: 'left' },
  { title: 'Cant.', width: 44, align: 'right' },
  { title: 'Precio unit.', width: 74, align: 'right' },
  { title: 'Total', width: 78, align: 'right' },
] as const;
const DESCRIPTION = 2;
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

export const formatRef = (n: number) => `REF ${amount.format(n)}`;
export const formatPercent = (n: number) => `${percent.format(n)}%`;
const bolivares = (n: number) => `Bs. ${amount.format(n)}`;
export const longDate = (d: Date) =>
  d.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
const shortDate = (d: Date) => d.toLocaleDateString('es-VE', { timeZone: TIME_ZONE });

/** Terms every quote carries. */
export const PRICE_TERMS = [
  'Precios unitarios en REF (dólares de referencia), sin IVA; el IVA (16%) se suma en el total.',
  'El pago en bolívares se calcula a la tasa BCV del día del pago.',
];

/**
 * A quote as a letter-size PDF — laid out the same on any device (printing
 * the web page from a phone scaled the phone layout onto the sheet). Text is
 * real text, long product lists flow onto more pages with the table header
 * repeated, and every page carries the page count.
 */
export function renderQuotePdf(quote: QuotePdf): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: quote.title, Author: 'Electron Plus', Subject: 'Cotización' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = drawHeader(doc, quote);
  y = drawParties(doc, quote.parties, y + 18);
  y = drawLines(doc, quote.lines, y + 18);
  y = drawTotals(doc, quote, y + 14);
  drawTerms(doc, quote.terms, y + 18);
  drawFooters(doc);

  doc.end();
  return finished;
}

function drawHeader(doc: Doc, quote: QuotePdf): number {
  doc.image(logoPng(), MARGIN, MARGIN, { width: 150 });

  let left = MARGIN + 42;
  doc.font(FONT).fontSize(8.5).fillColor(COLOR.muted);
  for (const line of [`Tel. ${CONTACT.phone}`, CONTACT.email, CONTACT.hours]) {
    doc.text(line, MARGIN, left, { width: 240, lineBreak: false });
    left += 12;
  }

  const right = { width: CONTENT_WIDTH, align: 'right' as const };
  let top = MARGIN - 2;
  doc
    .font(BOLD)
    .fontSize(9)
    .fillColor(COLOR.blue)
    .text('COTIZACIÓN', MARGIN, top, { ...right, characterSpacing: 1.5 });
  top += 13;
  doc
    .font(BOLD)
    .fontSize(20)
    .fillColor(COLOR.navy)
    .text(`N.º ${quote.numberLabel}`, MARGIN, top, right);
  top += 26;
  for (const line of quote.headerLines) {
    doc
      .font(line.strong ? BOLD : FONT)
      .fontSize(8.5)
      .fillColor(line.strong ? COLOR.navy : COLOR.muted)
      .text(line.text, MARGIN, top, right);
    top += 12;
  }

  const ruleY = Math.max(left, top) + 10;
  doc.rect(MARGIN, ruleY, CONTENT_WIDTH, 3).fill(COLOR.yellow);
  return ruleY + 3;
}

/** The two boxes under the header, side by side, as tall as the taller. */
function drawParties(doc: Doc, parties: QuotePdfParty[], y: number): number {
  const gap = 12;
  const boxWidth = (CONTENT_WIDTH - gap) / 2;
  const pad = 12;
  const inner = boxWidth - pad * 2;
  const heightOf = (box: QuotePdfParty) => {
    doc.font(BOLD).fontSize(11);
    let h = 12 + doc.heightOfString(box.heading, { width: inner }) + 4;
    doc.font(FONT).fontSize(9);
    for (const line of box.lines) h += doc.heightOfString(line, { width: inner }) + 2;
    return h + pad * 2;
  };
  const height = Math.max(...parties.map(heightOf));

  parties.forEach((box, i) => {
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
      .text(box.heading, x + pad, cy, { width: inner });
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
function drawLines(doc: Doc, lines: QuotePdfLine[], y: number): number {
  y = drawTableHeader(doc, y);
  const cellWidth = (c: number) => COLUMNS[c].width - CELL_PAD * 2;

  lines.forEach((line, index) => {
    const cells = [
      String(index + 1),
      line.sku,
      line.name,
      String(line.qty),
      formatRef(line.unitPrice),
      formatRef(line.lineTotal),
    ];
    doc.font(FONT).fontSize(9);
    const cellHeights = cells.map((cell, c) => doc.heightOfString(cell, { width: cellWidth(c) }));
    if (line.note) {
      doc.fontSize(7.5);
      cellHeights[DESCRIPTION] +=
        2 + doc.heightOfString(line.note, { width: cellWidth(DESCRIPTION) });
    }
    const height = Math.max(...cellHeights) + CELL_PAD * 2;

    if (y + height > BODY_BOTTOM) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN);
    }
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill(COLOR.surface);

    let x = MARGIN;
    cells.forEach((cell, c) => {
      doc
        .font(c === 5 ? BOLD : FONT)
        .fontSize(9)
        .fillColor(c === 0 ? COLOR.muted : COLOR.navy)
        .text(cell, x + CELL_PAD, y + CELL_PAD, { width: cellWidth(c), align: COLUMNS[c].align });
      if (c === DESCRIPTION && line.note) {
        doc
          .font(FONT)
          .fontSize(7.5)
          .fillColor(COLOR.muted)
          .text(line.note, x + CELL_PAD, doc.y + 2, { width: cellWidth(c) });
      }
      x += COLUMNS[c].width;
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
function drawTotals(doc: Doc, quote: QuotePdf, y: number): number {
  const rowHeight = 16;
  const totalHeight = 28;
  const notes = quote.totalNotes ?? [];
  const blockHeight =
    quote.totalRows.length * rowHeight + 6 + totalHeight + (quote.bcv ? 30 : 0) + notes.length * 12;
  if (y + Math.max(blockHeight, quote.qr ? 96 : 0) > BODY_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  const width = 236;
  const x = MARGIN + CONTENT_WIDTH - width;
  let cy = y;
  for (const row of quote.totalRows) {
    const value = row.amount < 0 ? `-${formatRef(-row.amount)}` : formatRef(row.amount);
    doc
      .font(FONT)
      .fontSize(9.5)
      .fillColor(COLOR.muted)
      .text(row.label, x, cy, { width, lineBreak: false });
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
  doc.text(formatRef(quote.total), x + 12, cy + 8, {
    width: width - 24,
    align: 'right',
    lineBreak: false,
  });
  cy += totalHeight;

  if (quote.bcv) {
    cy += 7;
    doc
      .font(BOLD)
      .fontSize(8.5)
      .fillColor(COLOR.navy)
      .text(`Equivale a ${bolivares(quote.total * quote.bcv.rate)}`, x, cy, {
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
        `Tasa BCV del ${shortDate(quote.bcv.date)}: ${bolivares(quote.bcv.rate)} por USD`,
        x,
        cy,
        { width, align: 'right', lineBreak: false },
      );
    cy += 11;
  }
  for (const note of notes) {
    cy += 1;
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(note, x, cy, { width, align: 'right', lineBreak: false });
    cy += 11;
  }

  if (quote.qr) {
    const size = 78;
    doc.image(quote.qr.png, MARGIN, y, { width: size, height: size });
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(quote.qr.caption, MARGIN + size + 10, y + 26, { width: 150 });
    cy = Math.max(cy, y + size);
  }
  return cy;
}

function drawTerms(doc: Doc, terms: string[], y: number): void {
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
