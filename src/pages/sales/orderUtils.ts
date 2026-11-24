// Shared shapes/helpers for sales & purchase orders (screens in sales/ and purchase/).
import { amt, fdate } from '../../lib/format';
import type { Business } from '../../lib/types';

export interface OrderItem {
  _id?: string; product: string; productName: string; manufacturerName: string; packing: string;
  qty: number; freeQty: number; rate: number; discountPct: number; fulfilledQty: number; remark: string;
  reservations?: { batch: string; batchNo: string; expiry?: string; qty: number }[];
}

export interface Order {
  _id: string; number: string; date: string; party: string; partyName: string;
  salesman?: string; salesmanName?: string; source?: string; deliveryDate?: string; expectedDate?: string;
  items: OrderItem[]; estimatedTotal: number; status: 'open' | 'partial' | 'completed' | 'cancelled';
  invoices?: string[]; purchases?: string[]; narration: string; createdAt: string; updatedAt?: string;
  reserve?: boolean; reserveUntil?: string;
}

// ---- stock reservation (sales orders) ----
export const itemReserved = (i: OrderItem) => (i.reservations || []).reduce((s, r) => s + r.qty, 0);
// Mirrors the backend: pending qty, plus free qty until the first supply.
export const itemReserveTarget = (i: OrderItem) => {
  const pending = Math.max(0, i.qty - (i.fulfilledQty || 0));
  return pending ? pending + ((i.fulfilledQty || 0) === 0 ? i.freeQty || 0 : 0) : 0;
};
export const reservationSummary = (o: Pick<Order, 'items' | 'reserve' | 'reserveUntil' | 'status'>) => {
  const live = o.status === 'open' || o.status === 'partial';
  const held = o.items.reduce((s, i) => s + itemReserved(i), 0);
  const need = o.items.reduce((s, i) => s + itemReserveTarget(i), 0);
  return { live, held, need, short: Math.max(0, need - held), active: live && !!o.reserve && held > 0 };
};

export const SOURCES: { value: string; label: string }[] = [
  { value: 'salesman', label: 'Salesman' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'walkin', label: 'Walk-in' },
  { value: 'portal', label: 'Portal' },
];
export const sourceLabel = (s?: string) => SOURCES.find((x) => x.value === s)?.label || s || '';

// Share of ordered qty already billed / received (0–100).
export const fulfilledPct = (o: Pick<Order, 'items'>) => {
  const ordered = o.items.reduce((s, i) => s + (i.qty || 0), 0);
  if (!ordered) return 0;
  const done = o.items.reduce((s, i) => s + Math.min(i.fulfilledQty || 0, i.qty || 0), 0);
  return Math.round((done / ordered) * 100);
};

export const STATUS_TABS = [
  { value: 'open,partial', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
];

// Plain-text order copy for WhatsApp (works for both directions).
export const orderWhatsAppText = (o: Pick<Order, 'number' | 'date' | 'partyName' | 'items' | 'estimatedTotal' | 'narration'> & { deliveryDate?: string; expectedDate?: string }, business: Business | null, kind: 'sales' | 'purchase') => {
  const lines = o.items.map((i, n) => `${n + 1}. ${i.productName}${i.packing ? ` (${i.packing})` : ''} — ${i.qty}${i.freeQty ? ` + ${i.freeQty} free` : ''}${kind === 'purchase' && i.rate ? ` @ ₹${amt(i.rate)}` : ''}${i.remark ? ` [${i.remark}]` : ''}`);
  const when = kind === 'sales' ? o.deliveryDate : o.expectedDate;
  return [
    kind === 'sales' ? `*Order confirmation ${o.number}*` : `*Purchase Order ${o.number}*`,
    `Date: ${fdate(o.date)}${when ? ` · ${kind === 'sales' ? 'Delivery' : 'Expected by'}: ${fdate(when)}` : ''}`,
    kind === 'sales' ? `Party: ${o.partyName}` : `To: ${o.partyName}`,
    '',
    ...lines,
    '',
    `Items: ${o.items.length} · Est. value: ₹${amt(o.estimatedTotal)}`,
    o.narration ? `Note: ${o.narration}` : '',
    kind === 'sales' ? 'Final bill amount may vary with batch, scheme & stock availability.' : 'Please confirm availability and dispatch date.',
    business ? `— ${business.name}${business.phone ? `, ${business.phone}` : ''}` : '',
  ].filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== '')).join('\n');
};
