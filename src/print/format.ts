import type { Business } from '../lib/types';

// How bills are printed: paper, columns and copies. Stored per business in
// settings.printFormat; the print window can change it for one print.

export type DocKind = 'sale' | 'sales_return' | 'purchase' | 'purchase_return';
export const DOC_TITLE: Record<DocKind, string> = { sale: 'TAX INVOICE', sales_return: 'CREDIT NOTE', purchase: 'PURCHASE VOUCHER', purchase_return: 'DEBIT NOTE' };

export type PrintLayout = 'a4l' | 'a4' | 'a5l' | 'a5' | 'dm80' | 'dm80h' | 'dm132';
export type ColumnKey = 'pack' | 'mfr' | 'hsn' | 'rack' | 'free' | 'mrp' | 'ptr' | 'pts' | 'disc' | 'taxable' | 'gst';

export interface PrintFormat {
  layout: PrintLayout;
  copies: 1 | 2 | 3;
  fontSize: 'small' | 'normal' | 'large';
  columns: Record<ColumnKey, boolean>;
  showBank: boolean;
  showTerms: boolean;
  /** Open the print window (preview + options) before printing. Off = print straight away. */
  askBeforePrint: boolean;
}

export interface LayoutInfo {
  id: PrintLayout; label: string; hint: string;
  dotMatrix: boolean;
  /** CSS @page size */
  page: string;
  /** Paper width for the on-screen preview, in CSS px */
  widthPx: number;
  /** Base font size (px) for laser layouts */
  font: number;
  /** dot-matrix: characters per line and lines per page */
  cols?: number; lines?: number;
}

const MM = 96 / 25.4;
export const LAYOUTS: LayoutInfo[] = [
  { id: 'a4l', label: 'A4 landscape', hint: 'Full width — every column fits. Most common for laser printers.', dotMatrix: false, page: 'A4 landscape', widthPx: 297 * MM, font: 10.5 },
  { id: 'a4', label: 'A4 portrait', hint: 'Standard sheet, upright. Long bills fit more rows per page.', dotMatrix: false, page: 'A4 portrait', widthPx: 210 * MM, font: 9 },
  { id: 'a5l', label: 'Half page (A5 landscape)', hint: 'Half of an A4 sheet — saves paper on small bills.', dotMatrix: false, page: 'A5 landscape', widthPx: 210 * MM, font: 8.5 },
  { id: 'a5', label: 'A5 portrait', hint: 'Small upright sheet. Turn off a few columns for best fit.', dotMatrix: false, page: 'A5 portrait', widthPx: 148 * MM, font: 7.2 },
  { id: 'dm80', label: 'Dot-matrix 80 column (10×12 in)', hint: 'Continuous paper, 80 characters a line. Columns that do not fit are left out.', dotMatrix: true, page: '10in 12in', widthPx: 10 * 96, font: 0, cols: 80, lines: 66 },
  { id: 'dm80h', label: 'Dot-matrix 80 column, half page (10×6 in)', hint: 'Half-height continuous stationery. Long bills continue on the next half page.', dotMatrix: true, page: '10in 6in', widthPx: 10 * 96, font: 0, cols: 80, lines: 32 },
  { id: 'dm132', label: 'Dot-matrix 132 column (15×12 in)', hint: 'Wide-carriage printer — room for all columns.', dotMatrix: true, page: '15in 12in', widthPx: 15 * 96, font: 0, cols: 132, lines: 66 },
];
export const layoutInfo = (id: PrintLayout) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

export const COLUMNS: { key: ColumnKey; label: string; hint?: string }[] = [
  { key: 'pack', label: 'Pack' },
  { key: 'mfr', label: 'Company (maker)' },
  { key: 'hsn', label: 'HSN code' },
  { key: 'rack', label: 'Rack', hint: 'Where it sits in the godown — handy on the packing copy' },
  { key: 'free', label: 'Free qty' },
  { key: 'mrp', label: 'MRP' },
  { key: 'ptr', label: 'PTR (retailer price)' },
  { key: 'pts', label: 'PTS (stockist price)' },
  { key: 'disc', label: 'Discount %' },
  { key: 'taxable', label: 'Taxable value' },
  { key: 'gst', label: 'GST %' },
];

export const DEFAULT_FORMAT: PrintFormat = {
  layout: 'a4l', copies: 1, fontSize: 'normal',
  columns: { pack: true, mfr: true, hsn: true, rack: false, free: true, mrp: true, ptr: false, pts: false, disc: true, taxable: true, gst: true },
  showBank: true, showTerms: true, askBeforePrint: true,
};

export const printFormatOf = (b: Business | null | undefined): PrintFormat => {
  const saved = (b?.settings?.printFormat || {}) as Partial<PrintFormat>;
  const layout = LAYOUTS.some((l) => l.id === saved.layout) ? saved.layout! : DEFAULT_FORMAT.layout;
  return {
    ...DEFAULT_FORMAT,
    ...saved,
    layout,
    copies: ([1, 2, 3].includes(Number(saved.copies)) ? Number(saved.copies) : 1) as PrintFormat['copies'],
    // Older setting "Show PTS column" carries over until the column list is saved.
    columns: { ...DEFAULT_FORMAT.columns, pts: !!b?.settings?.printShowPts, ...(saved.columns || {}) },
  };
};

export const COPY_LABELS: Record<'sale' | 'other', string[]> = {
  sale: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'],
  other: ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'],
};
