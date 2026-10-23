import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { StoreDetails } from './store-details';

/** One `orders.items_snapshot` entry, as far as the invoice reads it. */
export interface InvoiceLine {
  sku?: string;
  productName?: string;
  color?: string;
  optionLabel?: string;
  quantity?: number;
  unitPricePaise?: number;
  lineTotalPaise?: number;
}

export interface InvoiceAddress {
  recipientName?: string;
  phone?: string;
  email?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface InvoiceInput {
  invoiceNumber: string;
  invoiceDate: Date;
  orderNumber: string;
  orderDate?: Date | null;
  address: InvoiceAddress;
  lines: InvoiceLine[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  payment?: { method?: string | null; status?: string | null } | null;
  store: StoreDetails;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 40;
const RIGHT = PAGE_WIDTH - 40;
/** Lowest baseline for body content; the footer sits below it. */
const CONTENT_BOTTOM = 64;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const ACCENT = rgb(0.08, 0.18, 0.14);
const BAND = rgb(0.93, 0.94, 0.93);
const RULE = rgb(0.8, 0.8, 0.8);

const BODY_SIZE = 9;
const ROW_LEADING = 11;

/** Item table columns: text columns by left edge and width, numbers by right edge. */
const COLUMNS = {
  product: { x: LEFT, width: 196 },
  option: { x: 242, width: 118 },
  quantity: { right: 395 },
  unitPrice: { right: 475 },
  amount: { right: RIGHT },
} as const;

/** Characters outside WinAnsi that have an obvious plain-text spelling. */
const REPLACEMENTS: Record<string, string> = {
  '\u20b9': 'Rs.',
  '\u00a0': ' ',
  '\u2002': ' ',
  '\u2003': ' ',
  '\u2009': ' ',
  '\u202f': ' ',
  '\u2212': '-',
  '\u2010': '-',
  '\u2011': '-',
  '\u2192': '->',
  '\u2264': '<=',
  '\u2265': '>=',
};

/** Zero-width joiners and combining marks (incl. emoji variation selectors) attach to the previous character. */
const INVISIBLE = /^(?:\p{M}|[\u200b-\u200d\u2060])$/u;

/**
 * Makes text drawable with a standard (WinAnsi) font: known symbols are spelt
 * out, accented letters fall back to their base letter, and every run of
 * anything else (other scripts, emoji) becomes a single "?". It never throws.
 */
export const sanitizeForFont = (value: unknown, supported: ReadonlySet<number>): string => {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  let out = '';
  let inUnknownRun = false;
  for (const char of raw) {
    const replacement = REPLACEMENTS[char];
    if (replacement !== undefined) {
      out += replacement;
      inUnknownRun = false;
      continue;
    }
    const codePoint = char.codePointAt(0)!;
    if (/\s/u.test(char)) {
      out += ' ';
      inUnknownRun = false;
      continue;
    }
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
    if (supported.has(codePoint)) {
      out += char;
      inUnknownRun = false;
      continue;
    }
    const base = char.normalize('NFKD').replace(/\p{M}/gu, '');
    if (base && [...base].every((part) => supported.has(part.codePointAt(0)!))) {
      out += base;
      inUnknownRun = false;
      continue;
    }
    if (INVISIBLE.test(char)) continue;
    if (!inUnknownRun) out += '?';
    inUnknownRun = true;
  }
  return out.replace(/\s+/g, ' ').trim();
};

/** "Rs. 1,23,456.00" — amounts are stored in paise. */
export const invoiceMoney = (paise: number): string => {
  const rupees = Math.abs(paise) / 100;
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${paise < 0 ? '- ' : ''}Rs. ${formatted}`;
};

const invoiceDate = (value: Date | null | undefined): string =>
  value && !Number.isNaN(value.getTime())
    ? new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(value)
    : '-';

const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const PAYMENT_METHODS: Record<string, string> = {
  UPI: 'UPI',
  NB: 'Net banking',
  NETBANKING: 'Net banking',
  NET_BANKING: 'Net banking',
  CARD: 'Card',
  CREDIT_CARD: 'Credit card',
  DEBIT_CARD: 'Debit card',
};

const paymentMethodLabel = (method: string | null | undefined): string =>
  method ? (PAYMENT_METHODS[method.toUpperCase()] ?? titleCase(method)) : 'Online';

const paymentStatusLabel = (status: string | null | undefined): string => {
  if (!status) return 'Not recorded';
  if (status === 'CAPTURED') return 'Paid';
  return titleCase(status);
};

interface TextOptions {
  x: number;
  size?: number;
  font?: PDFFont;
  color?: ReturnType<typeof rgb>;
  /** Right-align so the text ends at `x`. */
  alignRight?: boolean;
}

/** Draws the invoice onto as many A4 pages as the items need. */
class InvoiceWriter {
  private readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  y = 0;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly supported: ReadonlySet<number>,
    private readonly input: InvoiceInput,
  ) {}

  clean(value: unknown): string {
    return sanitizeForFont(value, this.supported);
  }

  width(text: string, size = BODY_SIZE, font = this.regular): number {
    return font.widthOfTextAtSize(text, size);
  }

  /** Draws already-sanitised text on the current line. */
  draw(text: string, options: TextOptions): void {
    if (!text) return;
    const size = options.size ?? BODY_SIZE;
    const font = options.font ?? this.regular;
    const x = options.alignRight ? options.x - font.widthOfTextAtSize(text, size) : options.x;
    this.page.drawText(text, { x, y: this.y, size, font, color: options.color ?? INK });
  }

  /** Word-wraps into at most `maxLines`, ending a cut-off last line with "...". */
  wrap(
    text: string,
    maxWidth: number,
    maxLines: number,
    size = BODY_SIZE,
    font = this.regular,
  ): string[] {
    const lines: string[] = [];
    let current = '';
    const words = text.split(' ').filter(Boolean);
    const fits = (candidate: string): boolean =>
      font.widthOfTextAtSize(candidate, size) <= maxWidth;
    for (let index = 0; index < words.length; index += 1) {
      let word = words[index];
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
      }
      // A single word wider than the column is broken by characters.
      while (!fits(word)) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      current = word;
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && !fits(`${last}...`)) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}...`;
    return kept;
  }

  rule(y = this.y, color = RULE): void {
    this.page.drawLine({
      start: { x: LEFT, y },
      end: { x: RIGHT, y },
      thickness: 0.6,
      color,
    });
  }

  newPage(): void {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - 48;
  }

  /** Keeps `height` points together, continuing on a new page when they do not fit. */
  ensureSpace(height: number, onNewPage?: () => void): void {
    if (this.y - height >= CONTENT_BOTTOM) return;
    this.newPage();
    this.continuationHeader();
    onNewPage?.();
  }

  firstPageHeader(): void {
    const { store } = this.input;
    const top = this.y;
    this.draw(this.clean(store.name), { x: LEFT, size: 16, font: this.bold, color: ACCENT });
    this.y -= 15;
    const contact = [
      ...store.addressLines,
      store.phone ? `Phone: ${store.phone}` : '',
      store.email ? `Email: ${store.email}` : '',
    ].filter(Boolean);
    for (const line of contact) {
      this.draw(this.clean(line), { x: LEFT, color: MUTED });
      this.y -= 11.5;
    }
    const leftBottom = this.y;

    this.y = top;
    this.draw('INVOICE', { x: RIGHT, size: 20, font: this.bold, color: ACCENT, alignRight: true });
    this.y -= 22;
    const facts: Array<[string, string]> = [
      ['Invoice no.', this.input.invoiceNumber],
      ['Invoice date', invoiceDate(this.input.invoiceDate)],
      ['Order no.', this.input.orderNumber],
      ['Order date', invoiceDate(this.input.orderDate)],
    ];
    for (const [label, value] of facts) {
      this.draw(this.clean(value), { x: RIGHT, font: this.bold, alignRight: true });
      this.draw(`${label}:`, { x: RIGHT - 200, color: MUTED });
      this.y -= 12;
    }
    this.y = Math.min(this.y, leftBottom) - 6;
    this.rule();
    this.y -= 18;

    this.addresses();
    this.paymentDetails();
  }

  private addresses(): void {
    const address = this.input.address;
    const lines = [
      address.recipientName,
      address.line1,
      address.line2,
      [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
      address.country === 'IN' || !address.country ? 'India' : address.country,
      address.phone ? `Phone: ${address.phone}` : '',
    ]
      .map((line) => this.clean(line))
      .filter(Boolean);
    const billTo = [...lines, address.email ? this.clean(`Email: ${address.email}`) : ''].filter(
      Boolean,
    );
    const top = this.y;
    let lowest = top;
    for (const [title, x, block] of [
      ['Bill to', LEFT, billTo],
      ['Ship to', 310, lines],
    ] as const) {
      this.y = top;
      this.draw(title.toUpperCase(), { x, size: 8, font: this.bold, color: MUTED });
      this.y -= 13;
      for (const [index, line] of block.entries()) {
        for (const part of this.wrap(line, 235, 2)) {
          this.draw(part, { x, font: index === 0 ? this.bold : this.regular });
          this.y -= 11.5;
        }
      }
      lowest = Math.min(lowest, this.y);
    }
    this.y = lowest - 8;
  }

  private paymentDetails(): void {
    const payment = this.input.payment;
    const method = paymentMethodLabel(payment?.method);
    this.draw('PAYMENT', { x: LEFT, size: 8, font: this.bold, color: MUTED });
    this.y -= 13;
    this.draw(this.clean(`Method: ${method} (HDFC SmartGateway)`), { x: LEFT });
    this.draw(this.clean(`Status: ${paymentStatusLabel(payment?.status)}`), { x: 310 });
    this.y -= 22;
  }

  continuationHeader(): void {
    this.draw(this.clean(this.input.store.name), {
      x: LEFT,
      size: 11,
      font: this.bold,
      color: ACCENT,
    });
    this.draw(this.clean(`Invoice ${this.input.invoiceNumber} (continued)`), {
      x: RIGHT,
      color: MUTED,
      alignRight: true,
    });
    this.y -= 10;
    this.rule();
    this.y -= 20;
  }

  tableHeader(): void {
    this.page.drawRectangle({
      x: LEFT,
      y: this.y - 5,
      width: RIGHT - LEFT,
      height: 17,
      color: BAND,
    });
    const header = { size: 8, font: this.bold };
    this.draw('PRODUCT', { ...header, x: COLUMNS.product.x + 4 });
    this.draw('OPTION', { ...header, x: COLUMNS.option.x });
    this.draw('QTY', { ...header, x: COLUMNS.quantity.right, alignRight: true });
    this.draw('UNIT PRICE', { ...header, x: COLUMNS.unitPrice.right, alignRight: true });
    this.draw('AMOUNT', { ...header, x: COLUMNS.amount.right - 4, alignRight: true });
    this.y -= 20;
  }

  itemRow(line: InvoiceLine): void {
    const quantity = Number(line.quantity ?? 0);
    const unitPrice = Number(line.unitPricePaise ?? 0);
    const total = Number(line.lineTotalPaise ?? unitPrice * quantity);
    const product = this.wrap(
      this.clean(line.productName) || 'Product',
      COLUMNS.product.width - 4,
      2,
    );
    const sku = line.sku ? this.wrap(this.clean(`SKU: ${line.sku}`), COLUMNS.product.width, 1) : [];
    const option = this.wrap(
      this.clean(line.optionLabel ?? line.color) || '-',
      COLUMNS.option.width,
      3,
    );
    const height = Math.max(product.length + sku.length, option.length) * ROW_LEADING + 6;
    this.ensureSpace(height, () => this.tableHeader());

    const top = this.y;
    for (const text of product) {
      this.draw(text, { x: COLUMNS.product.x + 4 });
      this.y -= ROW_LEADING;
    }
    for (const text of sku) {
      this.draw(text, { x: COLUMNS.product.x + 4, size: 7.5, color: MUTED });
      this.y -= ROW_LEADING;
    }
    this.y = top;
    for (const text of option) {
      this.draw(text, { x: COLUMNS.option.x, color: MUTED });
      this.y -= ROW_LEADING;
    }
    this.y = top;
    this.draw(String(quantity), { x: COLUMNS.quantity.right, alignRight: true });
    this.draw(invoiceMoney(unitPrice), { x: COLUMNS.unitPrice.right, alignRight: true });
    this.draw(invoiceMoney(total), { x: COLUMNS.amount.right - 4, alignRight: true });
    this.y = top - height + ROW_LEADING;
    this.rule(this.y + 2);
    this.y -= 11;
  }

  totals(): void {
    const { subtotalPaise, discountPaise, shippingPaise, taxPaise, totalPaise } = this.input;
    const rows: Array<[string, string, boolean]> = [
      ['Subtotal', invoiceMoney(subtotalPaise), false],
      ...(discountPaise > 0
        ? [['Discount', invoiceMoney(-discountPaise), false] as [string, string, boolean]]
        : []),
      ['Shipping', shippingPaise > 0 ? invoiceMoney(shippingPaise) : 'Free', false],
      ...(taxPaise > 0
        ? [['Tax', invoiceMoney(taxPaise), false] as [string, string, boolean]]
        : []),
      ['Total', invoiceMoney(totalPaise), true],
    ];
    this.ensureSpace(rows.length * 15 + 16);
    this.y -= 6;
    for (const [label, value, strong] of rows) {
      if (strong) {
        this.y -= 4;
        this.page.drawLine({
          start: { x: 330, y: this.y + 10.5 },
          end: { x: RIGHT, y: this.y + 10.5 },
          thickness: 0.6,
          color: RULE,
        });
      }
      const font = strong ? this.bold : this.regular;
      const size = strong ? 11 : BODY_SIZE + 0.5;
      this.draw(label, { x: 340, size, font });
      this.draw(value, { x: COLUMNS.amount.right - 4, size, font, alignRight: true });
      this.y -= 15;
    }
  }

  footers(): void {
    const note = 'This is a computer-generated invoice and needs no signature.';
    for (const [index, page] of this.pages.entries()) {
      const pageLabel = `Page ${index + 1} of ${this.pages.length}`;
      page.drawLine({
        start: { x: LEFT, y: 44 },
        end: { x: RIGHT, y: 44 },
        thickness: 0.6,
        color: RULE,
      });
      page.drawText(note, { x: LEFT, y: 30, size: 7.5, font: this.regular, color: MUTED });
      page.drawText(pageLabel, {
        x: RIGHT - this.regular.widthOfTextAtSize(pageLabel, 7.5),
        y: 30,
        size: 7.5,
        font: this.regular,
        color: MUTED,
      });
    }
  }
}

/**
 * Renders a plain (non-GST) invoice. Items flow onto as many pages as they
 * need, with the table header repeated on each, and every page is numbered.
 */
export const renderInvoicePdf = async (input: InvoiceInput): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  document.setTitle(`Invoice ${input.invoiceNumber}`);
  document.setAuthor(input.store.name);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  // Helvetica and Helvetica-Bold share the WinAnsi character set.
  const supported = new Set(regular.getCharacterSet());
  const writer = new InvoiceWriter(document, regular, bold, supported, input);

  writer.newPage();
  writer.firstPageHeader();
  writer.tableHeader();
  for (const line of input.lines) writer.itemRow(line);
  writer.totals();
  writer.footers();
  return document.save();
};
