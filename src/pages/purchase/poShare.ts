import { api } from '../../api/client';
import { amt, fdate } from '../../lib/format';
import { openWhatsApp } from '../../lib/whatsapp';
import { printTable } from '../../print/print';
import type { Business } from '../../lib/types';
import { Order, orderWhatsAppText } from '../sales/orderUtils';

const lineAmt = (i: Order['items'][number]) => i.qty * (i.rate || 0) * (1 - (i.discountPct || 0) / 100);

export const printPO = (o: Order, business: Business) => {
  const rows = o.items.map((i, n) => [n + 1, i.productName, i.manufacturerName, i.packing, i.qty, i.freeQty || '', amt(i.rate), i.discountPct ? `${i.discountPct}%` : '', amt(lineAmt(i))]);
  const net = o.items.reduce((s, i) => s + lineAmt(i), 0);
  printTable(
    `Purchase Order ${o.number}`,
    business,
    `To: ${o.partyName} · Date: ${fdate(o.date)}${o.expectedDate ? ` · Expected by: ${fdate(o.expectedDate)}` : ''}${o.narration ? ` · Note: ${o.narration}` : ''}`,
    ['#', 'Product', 'Company', 'Pack', 'Qty', 'Free', 'Rate', 'Disc', 'Amount (excl. GST)'],
    rows,
    ['', `${o.items.length} items`, '', '', o.items.reduce((s, i) => s + i.qty, 0), o.items.reduce((s, i) => s + (i.freeQty || 0), 0), '', '', amt(net)],
    [4, 5, 6, 7, 8],
  );
};

// Supplier mobile isn't on the order — look it up from the party master.
export const whatsAppPO = async (o: Order, business: Business | null) => {
  let mobile = '';
  try { const r = await api.get(`/parties/${o.party}`); mobile = r.data.data.mobile || r.data.data.phone || ''; } catch { /* share without number */ }
  openWhatsApp(mobile, orderWhatsAppText(o, business, 'purchase'));
};
