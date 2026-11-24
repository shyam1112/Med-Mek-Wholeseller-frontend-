import type { Business, MoneyVoucher, Voucher } from '../lib/types';
import type { DocKind } from './format';
import { STATES } from '../lib/types';
import { amt, fdate, inWords } from '../lib/format';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const BASE_CSS = `
  *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;font-size:10.5px;color:#111;margin:0;padding:14px}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #444;padding:3px 4px;vertical-align:top}
  th{background:#eef2f5;font-weight:600;font-size:10px} .r{text-align:right} .c{text-align:center} .b{font-weight:700}
  .hdr{display:flex;justify-content:space-between;gap:12px;border:1px solid #444;border-bottom:none;padding:8px}
  .title{font-size:17px;font-weight:800;margin:0} .muted{color:#444} .doc{font-size:13px;font-weight:800;text-align:center;border:1px solid #444;border-bottom:none;padding:4px;letter-spacing:1px}
  .grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #444;border-bottom:none} .grid>div{padding:6px 8px} .grid>div+div{border-left:1px solid #444}
  .foot{display:grid;grid-template-columns:1.4fr 1fr;border:1px solid #444;border-top:none} .foot>div{padding:6px 8px} .foot>div+div{border-left:1px solid #444}
  .noborder td{border:none;padding:1px 0} .sig{margin-top:34px;text-align:right;font-weight:600}
  .stamp{display:inline-block;border:2px solid #b00;color:#b00;padding:2px 8px;font-weight:800;transform:rotate(-8deg);font-size:16px}
  @page{size:A4;margin:8mm} @media print{body{padding:0}}
`;

export const openPrint = (title: string, body: string, landscape = false) => {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${landscape ? '@page{size:A4 landscape}' : ''}</style></head><body>${body}<script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
};

export const bizHeader = (b: Business) => `
  <div>
    <p class="title">${esc(b.name)}</p>
    <div class="muted">${esc([b.address, b.city, b.pincode].filter(Boolean).join(', '))}</div>
    <div>${b.phone ? `Ph: ${esc(b.phone)} ` : ''}${b.email ? `· ${esc(b.email)}` : ''}</div>
  </div>
  <div style="text-align:right">
    ${b.gstin ? `<div><b>GSTIN:</b> ${esc(b.gstin)}</div>` : ''}
    ${b.dl20b || b.dl21b ? `<div><b>D.L. No:</b> ${esc([b.dl20b, b.dl21b].filter(Boolean).join(', '))}</div>` : ''}
    ${b.fssai ? `<div><b>FSSAI:</b> ${esc(b.fssai)}</div>` : ''}
    <div><b>State:</b> ${esc(STATES[b.stateCode] || '')} (${esc(b.stateCode)})</div>
  </div>`;

// Bills, credit/debit notes and purchase vouchers go through the print window
// (components/PrintHost.tsx): paper size, columns and copies, with a preview.
export const printVoucher = (v: Voucher, b: Business, kind: DocKind) => {
  window.dispatchEvent(new CustomEvent('mmw:print', { detail: { v, b, kind } }));
};

export const printMoneyVoucher = (m: MoneyVoucher, b: Business) => {
  const title = m.kind === 'receipt' ? 'RECEIPT' : 'PAYMENT VOUCHER';
  const allocs = m.allocations.map((a) => `<tr><td>${esc(a.billNo)}</td><td>${fdate(a.billDate)}</td><td class="r">${amt(a.amount)}</td></tr>`).join('');
  openPrint(`${title} ${m.number}`, `
    <div style="max-width:720px;margin:auto">
      <div class="doc">${title}</div>
      <div class="hdr">${bizHeader(b)}</div>
      <div style="border:1px solid #444;padding:10px">
        <table class="noborder" style="font-size:12px">
          <tr><td style="width:180px"><b>No.</b></td><td>${esc(m.number)}</td><td><b>Date</b></td><td>${fdate(m.date)}</td></tr>
          <tr><td><b>${m.kind === 'receipt' ? 'Received from' : 'Paid to'}</b></td><td colspan="3">${esc(m.partyName)}</td></tr>
          <tr><td><b>Amount</b></td><td colspan="3"><b style="font-size:15px">₹ ${amt(m.amount)}</b> — ${esc(inWords(m.amount))}</td></tr>
          <tr><td><b>Mode</b></td><td colspan="3">${esc(m.mode.toUpperCase())}${m.chequeNo ? ` · Cheque ${esc(m.chequeNo)} dt. ${fdate(m.chequeDate)} ${esc(m.bankName)}` : ''}${m.reference ? ` · Ref ${esc(m.reference)}` : ''}</td></tr>
          ${m.discount ? `<tr><td><b>Discount</b></td><td colspan="3">₹ ${amt(m.discount)}</td></tr>` : ''}
          ${m.tds ? `<tr><td><b>TDS</b></td><td colspan="3">₹ ${amt(m.tds)}</td></tr>` : ''}
          ${m.narration ? `<tr><td><b>Narration</b></td><td colspan="3">${esc(m.narration)}</td></tr>` : ''}
        </table>
        ${allocs ? `<div style="margin-top:8px"><b>Against bills</b></div><table><thead><tr><th>Bill</th><th>Date</th><th>Amount</th></tr></thead><tbody>${allocs}</tbody></table>` : ''}
        ${m.onAccount > 0.009 ? `<div style="margin-top:4px">On account: ₹ ${amt(m.onAccount)}</div>` : ''}
        <div class="sig">For ${esc(b.name)}</div>
      </div>
    </div>`);
};

// Generic printable table (ledger statements, outstanding letters…).
export const printTable = (title: string, b: Business, subtitle: string, headers: string[], rows: (string | number)[][], footer?: (string | number)[], rightCols: number[] = []) => {
  const td = (v: string | number, i: number) => `<td class="${rightCols.includes(i) ? 'r' : ''}">${esc(v)}</td>`;
  openPrint(title, `
    <div class="hdr" style="border-bottom:1px solid #444">${bizHeader(b)}</div>
    <h3 style="margin:10px 0 2px">${esc(title)}</h3><div class="muted" style="margin-bottom:8px">${esc(subtitle)}</div>
    <table><thead><tr>${headers.map((h, i) => `<th class="${rightCols.includes(i) ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('')}</tbody>
    ${footer ? `<tfoot><tr>${footer.map((v, i) => `<td class="b ${rightCols.includes(i) ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr></tfoot>` : ''}
    </table>`);
};
