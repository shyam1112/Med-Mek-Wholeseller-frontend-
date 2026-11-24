import type { Business, Voucher, VoucherLine } from '../lib/types';
import { STATES } from '../lib/types';
import { amt, fdate, fexp, inWords } from '../lib/format';
import { BASE_CSS, bizHeader, esc } from './print';
import { COPY_LABELS, DOC_TITLE, layoutInfo } from './format';
import type { ColumnKey, DocKind, PrintFormat } from './format';

/** Product id → rack, for the optional Rack column. */
export type Racks = Record<string, string>;

const SCALE = { small: 0.9, normal: 1, large: 1.12 };

const gstSummary = (v: Voucher) => {
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of v.items) {
    const r = byRate.get(l.gstRate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.taxableValue; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
    byRate.set(l.gstRate, r);
  }
  return [...byRate.entries()].sort((a, c) => a[0] - c[0]);
};

const copyLabelsFor = (kind: DocKind, copies: number) => (kind === 'sale' ? COPY_LABELS.sale : COPY_LABELS.other).slice(0, copies);

// ─── Laser / inkjet (A4, A5) ──────────────────────────────────────────────

interface Col { key: ColumnKey | 'always'; th: string; td: (l: VoucherLine) => string; cls?: string }

const laserCols = (fmt: PrintFormat, racks: Racks): Col[] => {
  const c = fmt.columns;
  const all: (Col & { on: boolean })[] = [
    { key: 'pack', on: c.pack, th: 'Pack', cls: 'c', td: (l) => esc(l.packing) },
    { key: 'rack', on: c.rack, th: 'Rack', cls: 'c', td: (l) => esc(racks[String(l.product)] || '') },
    { key: 'hsn', on: c.hsn, th: 'HSN', cls: 'c', td: (l) => esc(l.hsn) },
    { key: 'always', on: true, th: 'Batch', cls: 'c', td: (l) => esc(l.batchNo) },
    { key: 'always', on: true, th: 'Exp', cls: 'c', td: (l) => fexp(l.expiry) },
    { key: 'always', on: true, th: 'Qty', cls: 'r', td: (l) => String(l.qty) },
    { key: 'free', on: c.free, th: 'Free', cls: 'r', td: (l) => (l.freeQty ? String(l.freeQty) : '') },
    { key: 'mrp', on: c.mrp, th: 'MRP', cls: 'r', td: (l) => amt(l.mrp) },
    { key: 'ptr', on: c.ptr, th: 'PTR', cls: 'r', td: (l) => amt(l.ptr) },
    { key: 'pts', on: c.pts, th: 'PTS', cls: 'r', td: (l) => amt(l.pts) },
    { key: 'always', on: true, th: 'Rate', cls: 'r', td: (l) => amt(l.rate) },
    { key: 'disc', on: c.disc, th: 'Disc', cls: 'r', td: (l) => (l.discountPct ? l.discountPct + '%' : '') },
    { key: 'taxable', on: c.taxable, th: 'Taxable', cls: 'r', td: (l) => amt(l.taxableValue) },
    { key: 'gst', on: c.gst, th: 'GST', cls: 'r', td: (l) => l.gstRate + '%' },
  ];
  return all.filter((x) => x.on);
};

const laserCopy = (v: Voucher, b: Business, kind: DocKind, fmt: PrintFormat, racks: Racks, copyLabel: string) => {
  const inter = v.isInterState;
  const cols = laserCols(fmt, racks);
  const rows = v.items.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(l.productName)}</b>${l.schedule && l.schedule !== 'None' ? ` <span style="color:#b00">[${esc(l.schedule)}]</span>` : ''}${fmt.columns.mfr || (l.returnType && l.returnType !== 'saleable') ? `<div class="muted" style="font-size:0.85em">${fmt.columns.mfr ? esc(l.manufacturerName) : ''}${l.returnType && l.returnType !== 'saleable' ? ` · ${esc(l.returnType)}` : ''}</div>` : ''}</td>
      ${cols.map((c) => `<td class="${c.cls || ''}">${c.td(l)}</td>`).join('')}
      <td class="r b">${amt(l.total)}</td>
    </tr>`).join('');

  const gstRows = gstSummary(v).map(([rate, r]) => inter
    ? `<tr><td class="c">${rate}%</td><td class="r">${amt(r.taxable)}</td><td class="r">${amt(r.igst)}</td><td class="r">${amt(r.igst)}</td></tr>`
    : `<tr><td class="c">${rate}%</td><td class="r">${amt(r.taxable)}</td><td class="r">${amt(r.cgst)}</td><td class="r">${amt(r.sgst)}</td><td class="r">${amt(r.cgst + r.sgst)}</td></tr>`).join('');

  const partyLabel = kind === 'purchase' || kind === 'purchase_return' ? 'Supplier' : 'Bill To';
  const t = v.transport || {};
  const adj = (v.creditNoteAdjustments || v.debitNoteAdjustments || []) as { docNo: string; amount: number }[];
  return `<section class="copy">
  ${v.status === 'cancelled' ? '<div style="text-align:center;margin-bottom:6px"><span class="stamp">CANCELLED</span></div>' : ''}
  ${copyLabel ? `<div class="copylabel">${esc(copyLabel)}</div>` : ''}
  <div class="doc">${DOC_TITLE[kind]}</div>
  <div class="hdr">${bizHeader(b)}</div>
  <div class="grid">
    <div>
      <div class="muted" style="font-size:0.85em;text-transform:uppercase">${partyLabel}</div>
      <div class="b" style="font-size:1.15em">${esc(v.partyName)}</div>
      <div>${esc(v.partyAddress)}</div>
      ${v.partyGstin ? `<div><b>GSTIN:</b> ${esc(v.partyGstin)}</div>` : ''}
      ${v.partyDl ? `<div><b>D.L. No:</b> ${esc(v.partyDl)}</div>` : ''}
      <div><b>State:</b> ${esc(STATES[v.partyStateCode] || '')} ${v.partyStateCode ? `(${esc(v.partyStateCode)})` : ''}${v.partyPhone ? ` · <b>Ph:</b> ${esc(v.partyPhone)}` : ''}</div>
    </div>
    <div>
      <table class="noborder">
        <tr><td><b>${kind === 'sale' ? 'Invoice' : 'Voucher'} No</b></td><td>${esc(v.number)}</td></tr>
        <tr><td><b>Date</b></td><td>${fdate(v.date)}</td></tr>
        ${v.supplierInvoiceNo ? `<tr><td><b>Supplier Bill</b></td><td>${esc(v.supplierInvoiceNo)} dt. ${fdate(v.supplierInvoiceDate)}</td></tr>` : ''}
        ${v.againstInvoiceNo || v.againstPurchaseNo ? `<tr><td><b>Against</b></td><td>${esc(v.againstInvoiceNo || v.againstPurchaseNo)}</td></tr>` : ''}
        ${v.dueDate && kind === 'sale' ? `<tr><td><b>Due Date</b></td><td>${fdate(v.dueDate)}</td></tr>` : ''}
        ${v.salesmanName ? `<tr><td><b>Salesman</b></td><td>${esc(v.salesmanName)}</td></tr>` : ''}
        ${kind === 'sale' ? `<tr><td><b>Mode</b></td><td>${v.paymentMode === 'cash' ? 'CASH' : 'CREDIT'}</td></tr>` : ''}
        <tr><td><b>Place of Supply</b></td><td>${esc(STATES[v.partyStateCode || b.stateCode] || '')}</td></tr>
        ${v.ewayBillNo ? `<tr><td><b>E-Way Bill</b></td><td>${esc(v.ewayBillNo)}</td></tr>` : ''}
        ${t.vehicleNo || t.lrNo ? `<tr><td><b>Transport</b></td><td>${esc([t.transporterName, t.vehicleNo, t.lrNo && 'LR ' + t.lrNo].filter(Boolean).join(' · '))}</td></tr>` : ''}
        ${v.boxes ? `<tr><td><b>Cases</b></td><td>${v.boxes}</td></tr>` : ''}
      </table>
    </div>
  </div>
  ${v.irn ? `<div style="border:1px solid #444;border-bottom:none;padding:3px 8px;font-size:0.85em"><b>IRN:</b> ${esc(v.irn)} &nbsp; <b>Ack No:</b> ${esc(v.ackNo)} &nbsp; <b>Ack Date:</b> ${fdate(v.ackDate)}</div>` : ''}
  <table class="items">
    <thead><tr><th>#</th><th style="text-align:left">Product</th>${cols.map((c) => `<th>${c.th}</th>`).join('')}<th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">
    <div>
      <table style="margin-bottom:6px">
        <thead><tr>${inter ? '<th>GST %</th><th>Taxable</th><th>IGST</th><th>Total Tax</th>' : '<th>GST %</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total Tax</th>'}</tr></thead>
        <tbody>${gstRows}</tbody>
      </table>
      <div><b>${esc(inWords(v.grandTotal))}</b></div>
      ${adj.length ? `<div style="margin-top:4px">Adjusted: ${adj.map((a) => `${esc(a.docNo)} ₹${amt(a.amount)}`).join(', ')}</div>` : ''}
      ${v.narration ? `<div style="margin-top:4px"><b>Note:</b> ${esc(v.narration)}</div>` : ''}
      ${kind === 'sale' && fmt.showBank && b.bankAccount ? `<div style="margin-top:6px"><b>Bank:</b> ${esc(b.bankName)} · A/c ${esc(b.bankAccount)} · IFSC ${esc(b.bankIfsc)}${b.upiId ? ` · UPI ${esc(b.upiId)}` : ''}</div>` : ''}
      ${kind === 'sale' && fmt.showTerms && b.settings?.invoiceTerms ? `<div style="margin-top:6px;white-space:pre-line;font-size:0.85em" class="muted">${esc(b.settings.invoiceTerms)}</div>` : ''}
    </div>
    <div>
      <table class="noborder">
        <tr><td>Gross</td><td class="r">${amt(v.grossAmount)}</td></tr>
        ${v.discountAmount ? `<tr><td>Trade Discount</td><td class="r">- ${amt(v.discountAmount)}</td></tr>` : ''}
        ${v.cdAmount ? `<tr><td>Cash Discount (${v.cdPct}%)</td><td class="r">- ${amt(v.cdAmount)}</td></tr>` : ''}
        <tr><td>Taxable Value</td><td class="r">${amt(v.taxableAmount)}</td></tr>
        ${inter ? `<tr><td>IGST</td><td class="r">${amt(v.igst)}</td></tr>` : `<tr><td>CGST</td><td class="r">${amt(v.cgst)}</td></tr><tr><td>SGST</td><td class="r">${amt(v.sgst)}</td></tr>`}
        ${v.freight ? `<tr><td>Freight</td><td class="r">${amt(v.freight)}</td></tr>` : ''}
        ${v.roundOff ? `<tr><td>Round Off</td><td class="r">${amt(v.roundOff)}</td></tr>` : ''}
        <tr><td class="b" style="font-size:1.25em;border-top:1px solid #444;padding-top:3px">GRAND TOTAL</td><td class="r b" style="font-size:1.25em;border-top:1px solid #444;padding-top:3px">₹ ${amt(v.grandTotal)}</td></tr>
        ${typeof v.balance === 'number' && kind === 'sale' && v.balance !== v.grandTotal ? `<tr><td>Balance Due</td><td class="r">${amt(v.balance)}</td></tr>` : ''}
      </table>
      <div class="sig">For ${esc(b.name)}<br/><br/><span class="muted" style="font-weight:400">Authorised Signatory</span></div>
    </div>
  </div>
  ${kind === 'sale' ? `<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.85em" class="muted"><span>Total items: ${v.items.length} · Total qty: ${v.items.reduce((s, l) => s + l.qty + (l.freeQty || 0), 0)}</span><span>Receiver's signature ____________________</span></div>` : ''}
  </section>`;
};

// ─── Dot-matrix (plain text, fixed width) ─────────────────────────────────

interface TCol { key: ColumnKey | 'always'; h: string; w: number; right?: boolean; val: (l: VoucherLine, i: number) => string }

const pad = (s: string, w: number, right = false) => {
  const t = s.length > w ? s.slice(0, w) : s;
  return right ? t.padStart(w) : t.padEnd(w);
};
const two = (left: string, right: string, w: number) => {
  const r = right.slice(0, w - 1);
  return pad(left, w - r.length - 1) + ' ' + r;
};
const wrap = (s: string, w: number) => {
  const out: string[] = [];
  for (const para of String(s || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > w) { if (line) out.push(line); line = word.slice(0, w); } else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
};
const n2 = (x: number) => (Number(x) || 0).toFixed(2);

// Columns that don't fit the line width drop out in this order.
const DROP_ORDER: ColumnKey[] = ['taxable', 'mfr', 'hsn', 'ptr', 'pts', 'rack', 'pack', 'disc', 'gst', 'free', 'mrp'];
const MIN_PRODUCT = 18;

export const textColumns = (fmt: PrintFormat, width: number, racks: Racks) => {
  const c = fmt.columns;
  const all: TCol[] = [
    { key: 'always', h: 'Sr', w: 3, right: true, val: (_l, i) => String(i + 1) },
    { key: 'always', h: 'Product', w: 0, val: (l) => l.productName + (l.schedule && l.schedule !== 'None' ? ` [${l.schedule}]` : '') },
    { key: 'mfr', h: 'Company', w: 8, val: (l) => l.manufacturerName },
    { key: 'pack', h: 'Pack', w: 7, val: (l) => l.packing },
    { key: 'rack', h: 'Rack', w: 5, val: (l) => racks[String(l.product)] || '' },
    { key: 'hsn', h: 'HSN', w: 8, val: (l) => l.hsn },
    { key: 'always', h: 'Batch', w: 9, val: (l) => l.batchNo },
    { key: 'always', h: 'Exp', w: 5, val: (l) => fexp(l.expiry) },
    { key: 'always', h: 'Qty', w: 5, right: true, val: (l) => String(l.qty) },
    { key: 'free', h: 'Fr', w: 4, right: true, val: (l) => (l.freeQty ? String(l.freeQty) : '') },
    { key: 'mrp', h: 'MRP', w: 8, right: true, val: (l) => n2(l.mrp) },
    { key: 'ptr', h: 'PTR', w: 8, right: true, val: (l) => n2(l.ptr) },
    { key: 'pts', h: 'PTS', w: 8, right: true, val: (l) => n2(l.pts) },
    { key: 'always', h: 'Rate', w: 8, right: true, val: (l) => n2(l.rate) },
    { key: 'disc', h: 'Dis%', w: 5, right: true, val: (l) => (l.discountPct ? String(l.discountPct) : '') },
    { key: 'gst', h: 'GST', w: 3, right: true, val: (l) => String(l.gstRate) },
    { key: 'taxable', h: 'Taxable', w: 10, right: true, val: (l) => n2(l.taxableValue) },
    { key: 'always', h: 'Amount', w: 10, right: true, val: (l) => n2(l.total) },
  ];
  let cols = all.filter((x) => x.key === 'always' || c[x.key as ColumnKey]);
  const used = () => cols.reduce((s, x) => s + x.w + 1, 0) - 1;
  const dropped: ColumnKey[] = [];
  for (const k of DROP_ORDER) {
    if (width - used() >= MIN_PRODUCT) break;
    if (cols.some((x) => x.key === k)) { cols = cols.filter((x) => x.key !== k); dropped.push(k); }
  }
  const product = cols.find((x) => x.h === 'Product')!;
  product.w = Math.max(10, width - used());
  return { cols, dropped };
};

const textPages = (v: Voucher, b: Business, kind: DocKind, fmt: PrintFormat, racks: Racks, copyLabel: string) => {
  const L = layoutInfo(fmt.layout);
  const W = L.cols || 80, H = L.lines || 66;
  const { cols } = textColumns(fmt, W, racks);
  const rule = (ch = '-') => ch.repeat(W);
  const half = Math.floor(W / 2);
  const inter = v.isInterState;

  // Page header (repeats on every page).
  const header = (page: number, pages: number) => {
    const out = [rule('=')];
    out.push(two(b.name.toUpperCase(), DOC_TITLE[kind], W));
    out.push(two([b.address, b.city, b.pincode].filter(Boolean).join(', '), b.gstin ? `GSTIN: ${b.gstin}` : '', W));
    out.push(two([b.phone && `Ph: ${b.phone}`, (b.dl20b || b.dl21b) && `DL: ${[b.dl20b, b.dl21b].filter(Boolean).join(', ')}`].filter(Boolean).join('  '), copyLabel, W));
    out.push(rule());
    const party = [
      `${kind === 'purchase' || kind === 'purchase_return' ? 'From' : 'To'}: ${v.partyName}`,
      v.partyAddress || '',
      [v.partyGstin && `GSTIN: ${v.partyGstin}`, v.partyDl && `DL: ${v.partyDl}`].filter(Boolean).join(' '),
    ];
    const info = [
      `${kind === 'sale' ? 'Inv' : 'Vch'} No: ${v.number}`,
      `Date  : ${fdate(v.date)}${kind === 'sale' ? `  ${v.paymentMode === 'cash' ? 'CASH' : 'CREDIT'}` : ''}`,
      `${v.dueDate && kind === 'sale' ? `Due: ${fdate(v.dueDate)}  ` : ''}Page ${page}/${pages}`,
    ];
    const rw = Math.min(30, half);
    for (let i = 0; i < 3; i++) out.push(pad(party[i], W - rw - 1) + ' ' + pad(info[i], rw));
    out.push(rule());
    out.push(cols.map((c) => pad(c.h, c.w, c.right)).join(' '));
    out.push(rule());
    return out;
  };

  // Totals block (last page only).
  const footer = () => {
    const left: string[] = [];
    const lw = W - 34;
    left.push(inter ? pad('GST%', 5) + pad('Taxable', 11, true) + pad('IGST', 10, true) : pad('GST%', 5) + pad('Taxable', 11, true) + pad('CGST', 9, true) + pad('SGST', 9, true));
    for (const [rate, r] of gstSummary(v)) {
      left.push(inter ? pad(rate + '%', 5) + pad(n2(r.taxable), 11, true) + pad(n2(r.igst), 10, true) : pad(rate + '%', 5) + pad(n2(r.taxable), 11, true) + pad(n2(r.cgst), 9, true) + pad(n2(r.sgst), 9, true));
    }
    left.push(`Items: ${v.items.length}  Qty: ${v.items.reduce((s, l) => s + l.qty + (l.freeQty || 0), 0)}`);
    const right: [string, string][] = [['Gross', n2(v.grossAmount)]];
    if (v.discountAmount) right.push(['Discount', '-' + n2(v.discountAmount)]);
    if (v.cdAmount) right.push([`Cash disc ${v.cdPct}%`, '-' + n2(v.cdAmount)]);
    right.push(['Taxable', n2(v.taxableAmount)]);
    if (inter) right.push(['IGST', n2(v.igst)]); else { right.push(['CGST', n2(v.cgst)]); right.push(['SGST', n2(v.sgst)]); }
    if (v.freight) right.push(['Freight', n2(v.freight)]);
    if (v.roundOff) right.push(['Round off', n2(v.roundOff)]);
    right.push(['GRAND TOTAL', n2(v.grandTotal)]);
    const out = [rule()];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const r = right[i] ? pad(right[i][0], 16) + pad(right[i][1], 16, true) : '';
      out.push(pad(left[i] || '', lw) + '| ' + r);
    }
    out.push(rule());
    out.push(...wrap(inWords(v.grandTotal), W));
    if (v.narration) out.push(...wrap('Note: ' + v.narration, W).slice(0, 2));
    if (kind === 'sale' && fmt.showBank && b.bankAccount) out.push(...wrap(`Bank: ${b.bankName} A/c ${b.bankAccount} IFSC ${b.bankIfsc}${b.upiId ? ` UPI ${b.upiId}` : ''}`, W).slice(0, 2));
    if (kind === 'sale' && fmt.showTerms && b.settings?.invoiceTerms) out.push(...wrap(b.settings.invoiceTerms, W).slice(0, H < 40 ? 1 : 3));
    out.push(pad(`For ${b.name}`, W, true));
    out.push('');
    out.push(two(kind === 'sale' ? "Receiver's signature" : '', 'Authorised Signatory', W));
    return out;
  };

  const itemLines = v.items.map((l, i) => cols.map((c) => pad(c.val(l, i), c.w, c.right)).join(' '));
  const foot = footer();
  const head = header(1, 1).length;
  const per = Math.max(1, H - head - 1); // 1 line for "continued"
  // Fill pages; the last one must also hold the totals block.
  const chunks: string[][] = [];
  let rest = itemLines.slice();
  while (rest.length) {
    if (rest.length + foot.length <= H - head) { chunks.push(rest); rest = []; break; }
    const take = Math.min(per, rest.length);
    // If everything left fits on this page but the totals don't, leave one row for the next page.
    const n = take === rest.length ? Math.max(1, take - 1) : take;
    chunks.push(rest.slice(0, n)); rest = rest.slice(n);
    if (!rest.length) chunks.push([]);
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((rows, i) => {
    const last = i === chunks.length - 1;
    const lines = [...header(i + 1, chunks.length), ...rows];
    if (last) {
      while (lines.length + foot.length < H) lines.push('');
      lines.push(...foot);
    } else {
      while (lines.length < H - 1) lines.push('');
      lines.push(pad('', W - 24) + pad('Continued on next page…', 24, true));
    }
    return lines.slice(0, H).join('\n');
  });
};

/** Plain-text bill (form feed between pages) for DOS / "Generic Text Only" printing. */
export const voucherText = (v: Voucher, b: Business, kind: DocKind, fmt: PrintFormat, racks: Racks = {}) =>
  copyLabelsFor(kind, fmt.copies).flatMap((label) => textPages(v, b, kind, fmt, racks, fmt.copies > 1 ? label : '')).join('\n\f');

// ─── Whole document ───────────────────────────────────────────────────────

/** A complete HTML page for the bill. `preview` adds an on-screen paper look scaled to fit `previewWidth`. */
export const voucherDocument = (v: Voucher, b: Business, kind: DocKind, fmt: PrintFormat, racks: Racks = {}, opts: { preview?: boolean; previewWidth?: number; autoPrint?: boolean } = {}) => {
  const L = layoutInfo(fmt.layout);
  const labels = copyLabelsFor(kind, fmt.copies);
  const zoom = opts.preview && opts.previewWidth ? Math.min(1, (opts.previewWidth - 32) / L.widthPx) : 1;
  const screen = opts.preview ? `@media screen{
    html{background:#d7dce2} body{zoom:${zoom.toFixed(3)};padding:16px 0}
    .copy,.dmpage{background:#fff;width:${Math.round(L.widthPx)}px;margin:0 auto 16px;padding:${L.dotMatrix ? '0.25in' : '8mm'};box-shadow:0 2px 10px rgba(0,0,0,.25)}
  }` : '';
  let body: string;
  let css: string;
  if (L.dotMatrix) {
    const pages = labels.flatMap((label) => textPages(v, b, kind, fmt, racks, fmt.copies > 1 ? label : ''));
    body = pages.map((p) => `<pre class="dmpage">${esc(p)}</pre>`).join('');
    // 12pt Courier = 10 characters per inch, 6 lines per inch: the native pitch of dot-matrix printers.
    css = `body{margin:0;padding:0;font-family:"Courier New",Courier,monospace;color:#000}
      pre{font:12pt/12pt "Courier New",Courier,monospace;margin:0;white-space:pre;overflow:hidden}
      .dmpage+.dmpage{break-before:page}
      @page{size:${L.page};margin:0.25in}`;
  } else {
    body = labels.map((label) => laserCopy(v, b, kind, fmt, racks, fmt.copies > 1 ? label : '')).join('');
    const f = +(L.font * SCALE[fmt.fontSize]).toFixed(2);
    css = `${BASE_CSS}
      body{font-size:${f}px;padding:0} th{font-size:0.95em} .title{font-size:1.6em} .doc{font-size:1.25em}
      table.items thead{display:table-header-group} table.items tr{break-inside:avoid}
      .copy+.copy{break-before:page} .copylabel{text-align:right;font-size:0.85em;font-weight:700;letter-spacing:.5px;margin-bottom:2px}
      .foot{break-inside:avoid}
      @page{size:${L.page};margin:${fmt.layout === 'a5' || fmt.layout === 'a5l' ? '5mm' : '8mm'}}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(`${DOC_TITLE[kind]} ${v.number}`)}</title>
    <style>${css}${screen}</style></head><body>${body}${opts.autoPrint ? '<script>window.onload=()=>{window.print();}</script>' : ''}</body></html>`;
};

/** Print an HTML document without a pop-up window (hidden frame). */
export const printHtml = (html: string) => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  f.srcdoc = html;
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
    setTimeout(() => f.remove(), 60_000);
  };
  document.body.appendChild(f);
};
