import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { api, errBody, errMsg, RuleWarning } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useDebounced, useHotkey } from '../../lib/hooks';
import { amt, drcr, fdate, fexp, inr, isoDate, today } from '../../lib/format';
import { printVoucher } from '../../print/print';
import { openWhatsApp } from '../../lib/whatsapp';
import type { Batch, Party, Product, Voucher } from '../../lib/types';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import BatchPicker from './BatchPicker';
import BatchStrip, { fefoPick } from './BatchStrip';
import { calcLine, calcTotals, schemeFree } from './calc';

interface Line {
  key: string;
  productId: string;
  productName: string;
  manufacturerName: string;
  packing: string;
  schedule: string;
  gstRate: number;
  batch: Batch;
  qty: number;
  freeQty: number;
  rate: number;
  discountPct: number;
  schemeBuy: number;
  schemeFree: number;
  orderItem?: string;
  salesOrder?: string;
}

interface PartySummary {
  data: Party & { balance: number };
  summary: { overdue: number; outstanding: number; creditAvailable: number | null; dlExpired: boolean; openNotes: { _id: string; number: string; date: string; balance: number }[]; lastBill?: { number: string; date: string; grandTotal: number } };
}

// A sales order as listed on this screen (pending orders of the customer).
interface OrderRef { _id: string; number: string; date: string; status?: string; salesmanName?: string; items?: { qty: number; fulfilledQty: number; rate: number }[] }
const pendingValue = (o: OrderRef) => (o.items || []).reduce((s, i) => s + Math.max(0, i.qty - (i.fulfilledQty || 0)) * (i.rate || 0), 0);

// The bill as typed so far — auto-saved (see useDraft) so leaving the
// screen, a refresh or a power cut doesn't lose it.
interface Draft {
  party: PartyOption | null; date: string; paymentMode: 'credit' | 'cash'; cdPct: string; freight: string; narration: string;
  salesman: string; lines: Line[]; orderInfo: Record<string, OrderRef>; orderHeld: Record<string, number>;
  shortages: { productName: string; short: number; orderNo?: string }[]; cnAdjust: Record<string, number>;
  transport: { boxes: string; transporterName: string; vehicleNo: string; lrNo: string; distanceKm: string };
}
const draftLabel = (d: unknown) => {
  const x = d as Draft;
  return `${x.party?.name || 'no customer yet'} · ${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`;
};

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

const emptyEntry = { qty: '', freeQty: '', rate: '', discountPct: '' };

export default function SalesInvoiceEntry() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { business, can } = useAuth();
  // Auto-save: restored when the screen opens empty (or for the same bill
  // being edited); offered when it opens for an order/party.
  const [draftReady, setDraftReady] = useState(false);
  const [docUpdatedAt, setDocUpdatedAt] = useState<number | undefined>();
  const roundOff = business?.settings?.roundOff !== false;

  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyInfo, setPartyInfo] = useState<PartySummary | null>(null);
  const [date, setDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState<'credit' | 'cash'>('credit');
  const [cdPct, setCdPct] = useState<string>('');
  const [freight, setFreight] = useState<string>('');
  const [narration, setNarration] = useState('');
  const [salesman, setSalesman] = useState('');
  const [users, setUsers] = useState<{ _id: string; name: string; role: string }[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  // Orders this bill supplies, by id (number/date for display). A bill can
  // cover several pending orders of the customer, dated as they ask.
  const [orderInfo, setOrderInfo] = useState<Record<string, OrderRef>>({});
  const [pendingOrders, setPendingOrders] = useState<OrderRef[]>([]);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [ordersPick, setOrdersPick] = useState<string[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [shortages, setShortages] = useState<{ productName: string; short: number; orderNo?: string }[]>([]);
  const [cnAdjust, setCnAdjust] = useState<Record<string, number>>({});
  const [showTransport, setShowTransport] = useState(false);
  const [transport, setTransport] = useState({ boxes: '', transporterName: '', vehicleNo: '', lrNo: '', distanceKm: '' });
  const [docNumber, setDocNumber] = useState('');

  // entry row
  const [entryProduct, setEntryProduct] = useState<ProductOption | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [entryBatch, setEntryBatch] = useState<{ batch: Batch; product: Product; all: Batch[]; minExpiryDays?: number } | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const pickSeq = useRef(0);
  // Line whose batch is being changed from the lines table.
  const [changeLine, setChangeLine] = useState<Line | null>(null);
  // Per-browser override of the business "batch selection" setting.
  const [batchMode, setBatchMode] = useState<'auto' | 'ask'>(() => {
    try { const v = localStorage.getItem('mmw_batch_mode'); if (v === 'auto' || v === 'ask') return v; } catch { /* storage blocked */ }
    return business?.settings?.batchSelection || 'auto';
  });
  const toggleBatchMode = (m: 'auto' | 'ask') => {
    setBatchMode(m);
    try { localStorage.setItem('mmw_batch_mode', m); } catch { /* storage blocked */ }
  };
  const [entry, setEntry] = useState(emptyEntry);
  const [freeTouched, setFreeTouched] = useState(false);

  // edit mode: qty already held by this bill per batch (it's given back on save)
  const [heldByBill, setHeldByBill] = useState<Record<string, number>>({});
  // Stock the linked sales order holds per batch — usable by this bill only.
  const [orderHeld, setOrderHeld] = useState<Record<string, number>>({});
  const loadOrderHeld = (orders: { items: { reservations?: { batch: string; qty: number }[] }[] }[], fresh = false) => {
    setOrderHeld((prev) => {
      const m = fresh ? {} : { ...prev };
      for (const o of orders) for (const i of o.items) for (const r of i.reservations || []) m[r.batch] = (m[r.batch] || 0) + r.qty;
      return m;
    });
  };

  const [warnings, setWarnings] = useState<RuleWarning[]>([]);
  const [blocked, setBlocked] = useState<RuleWarning[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Voucher | null>(null);

  const productRef = useRef<HTMLInputElement>(null);
  const partyRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const freeRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLInputElement>(null);

  const inter = !!(partyInfo?.data.stateCode && business?.stateCode && partyInfo.data.stateCode !== business.stateCode);
  const cd = cdPct === '' ? partyInfo?.data.cashDiscountPct || 0 : Number(cdPct) || 0;

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r.data.data.filter((u: { role: string; isActive: boolean }) => u.isActive && ['salesman', 'owner', 'admin', 'billing'].includes(u.role)))).catch(() => {});
  }, []);

  const loadParty = useCallback(async (pid: string) => {
    const r = await api.get(`/parties/${pid}`);
    setPartyInfo(r.data);
    const sid = r.data.data.salesman?._id || r.data.data.salesman;
    if (sid) setSalesman(String(sid));
    return r.data as PartySummary;
  }, []);

  useEffect(() => {
    if (!party) { setPartyInfo(null); return; }
    loadParty(party._id).catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }));
  }, [party, loadParty, enqueueSnackbar]);

  // Build a line from a product's batch list (used by order fill and edit).
  const batchesFor = async (productId: string, partyId?: string) => {
    const r = await api.get(`/products/${productId}/batches`, { params: { party: partyId, all: 'true' } });
    return { product: r.data.product as Product, batches: r.data.data as Batch[] };
  };

  // Pull pending qty of sales orders onto the bill (FEFO, own reservations
  // first). `fresh` also takes the customer and salesman from the orders.
  const addOrders = async (ids: string[], fresh = false) => {
    const r = await api.get('/sales-orders/fill', { params: { ids: ids.join(',') } });
    const orders: (OrderRef & { party: string; partyName: string; salesman?: string; items: { reservations?: { batch: string; qty: number }[] }[] })[] = r.data.orders;
    const first = orders[0];
    if (fresh) {
      setParty({ _id: first.party, name: first.partyName });
      if (first.salesman) setSalesman(first.salesman);
    }
    // A fresh load replaces (the page's start-up effect may run twice).
    loadOrderHeld(orders, fresh);
    setOrderInfo((m) => ({ ...(fresh ? {} : m), ...Object.fromEntries(orders.map((o) => [o._id, o])) }));
    setShortages((x) => [...(fresh ? [] : x), ...r.data.shortages]);
    const out: Line[] = [];
    for (const fl of r.data.lines) {
      const { product, batches } = await batchesFor(fl.product, first.party);
      const b = batches.find((x) => x._id === fl.batch);
      if (!b) continue;
      out.push({
        key: nextKey(), productId: product._id, productName: product.name, manufacturerName: product.manufacturerName, packing: product.packing,
        schedule: product.schedule, gstRate: product.gstRate, batch: b, qty: fl.qty, freeQty: fl.freeQty || 0,
        rate: fl.rate || b.quote?.rate || b.ptr, discountPct: fl.discountPct ?? b.quote?.discountPct ?? 0,
        schemeBuy: b.quote?.schemeBuy || 0, schemeFree: b.quote?.schemeFree || 0, orderItem: fl.orderItem, salesOrder: fl.salesOrder,
      });
    }
    setLines((ls) => [...(fresh ? [] : ls), ...out]);
    setNarration((n) => {
      const auto = fresh || !n || /^Against orders? /.test(n);
      const nos = orders.map((o) => o.number).filter((no) => fresh || !n.includes(no));
      if (!nos.length) return n;
      if (!auto) return `${n} · ${nos.join(', ')}`;
      const all = [...(fresh || !n ? [] : n.replace(/^Against orders? /, '').split(', ')), ...nos];
      return `Against order${all.length > 1 ? 's' : ''} ${all.join(', ')}`;
    });
    return out.length;
  };

  const applyDraft = (d: Draft) => {
    setParty(d.party); setDate(d.date); setPaymentMode(d.paymentMode); setCdPct(d.cdPct); setFreight(d.freight); setNarration(d.narration);
    setSalesman(d.salesman); setOrderInfo(d.orderInfo || {}); setOrderHeld(d.orderHeld || {}); setShortages(d.shortages || []);
    setCnAdjust(d.cnAdjust || {}); setTransport(d.transport);
    setLines((d.lines || []).map((l) => ({ ...l, key: nextKey() })));
    setTimeout(() => (d.party ? productRef : partyRef).current?.focus(), 300);
  };

  // ---- initial loads: edit / order / party preselect ----
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const inv: Voucher = (await api.get(`/sales/${id}`)).data.data;
          if (inv.status !== 'active') { enqueueSnackbar('Cancelled bills cannot be edited.', { variant: 'warning' }); nav(`/sales/${id}`); return; }
          setDocNumber(inv.number);
          setParty({ _id: inv.party, name: inv.partyName });
          setDate(isoDate(inv.date));
          setPaymentMode(inv.paymentMode);
          setCdPct(String(inv.cdPct || 0));
          setFreight(inv.freight ? String(inv.freight) : '');
          setNarration(inv.narration || '');
          if (inv.salesman) setSalesman(inv.salesman);
          const invOrders: string[] = inv.salesOrders?.length ? inv.salesOrders : inv.salesOrder ? [inv.salesOrder] : [];
          Promise.all(invOrders.map((o) => api.get(`/sales-orders/${o}`).then((r) => r.data.data))).then((os) => {
            loadOrderHeld(os, true);
            setOrderInfo(Object.fromEntries(os.map((o) => [o._id, o])));
          }).catch(() => {});
          setCnAdjust(Object.fromEntries((inv.creditNoteAdjustments || []).map((a: { doc: string; amount: number }) => [a.doc, a.amount])));
          const t = inv.transport || {};
          setTransport({ boxes: inv.boxes ? String(inv.boxes) : '', transporterName: t.transporterName || '', vehicleNo: t.vehicleNo || '', lrNo: t.lrNo || '', distanceKm: t.distanceKm ? String(t.distanceKm) : '' });
          const held: Record<string, number> = {};
          const out: Line[] = [];
          for (const l of inv.items) {
            held[l.batch!] = (held[l.batch!] || 0) + l.qty + (l.freeQty || 0);
            const { product, batches } = await batchesFor(l.product, inv.party);
            const b = batches.find((x) => x._id === l.batch) || ({ _id: l.batch, batchNo: l.batchNo, expiry: l.expiry, mrp: l.mrp, ptr: l.ptr, qty: 0 } as unknown as Batch);
            out.push({ key: nextKey(), productId: l.product, productName: l.productName, manufacturerName: l.manufacturerName, packing: l.packing, schedule: l.schedule, gstRate: l.gstRate, batch: b, qty: l.qty, freeQty: l.freeQty, rate: l.rate, discountPct: l.discountPct, schemeBuy: product.schemeBuy, schemeFree: product.schemeFree, orderItem: l.orderItem, salesOrder: l.orderItem ? l.salesOrder || inv.salesOrder : undefined });
          }
          setHeldByBill(held);
          setLines(out);
          setDocUpdatedAt(inv.updatedAt ? Date.parse(inv.updatedAt) : undefined);
          setDraftReady(true);
          return;
        }
        const orderIds = (sp.get('orders') || sp.get('order') || '').split(',').filter(Boolean);
        const pid = sp.get('party');
        setDraftReady(true);
        if (!orderIds.length && !pid) return;
        if (orderIds.length) {
          await addOrders(orderIds, true);
          return;
        }
        if (pid) {
          const info = await loadParty(pid);
          setParty({ _id: pid, name: info.data.name });
        }
      } catch (e) {
        enqueueSnackbar(errMsg(e), { variant: 'error' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { if (!id && !sp.get('order') && !sp.get('orders') && !sp.get('party')) partyRef.current?.focus(); }, [id, sp]);

  const hasParams = !!(sp.get('order') || sp.get('orders') || sp.get('party'));
  const draft = useDraft<Draft>({
    key: id ? `sales_bill:${id}` : 'sales_bill:new',
    ready: draftReady,
    autoRestore: !!id || !hasParams,
    value: party || lines.length ? { party, date, paymentMode, cdPct, freight, narration, salesman, lines, orderInfo, orderHeld, shortages, cnAdjust, transport } : null,
    apply: applyDraft,
    paused: !!saved,
    notBefore: docUpdatedAt,
  });
  const discardDraft = () => { draft.clear(); if (id) nav(`/sales/${id}`); else newBill(); };

  // Orders on this bill (from its lines) and the customer's other pending orders.
  const billOrders = useMemo(() => [...new Set(lines.map((l) => l.salesOrder).filter(Boolean) as string[])], [lines]);
  useEffect(() => {
    if (!party) { setPendingOrders([]); return; }
    api.get('/sales-orders', { params: { party: party._id, status: 'open,partial', limit: 100 } })
      .then((r) => setPendingOrders(r.data.data))
      .catch(() => setPendingOrders([]));
  }, [party]);
  const otherPending = pendingOrders.filter((o) => !billOrders.includes(o._id));
  const openOrders = () => { setOrdersPick(otherPending.map((o) => o._id)); setOrdersOpen(true); };
  const confirmOrders = async () => {
    if (!ordersPick.length) return;
    setOrdersLoading(true);
    try {
      const n = await addOrders(ordersPick);
      enqueueSnackbar(`${ordersPick.length} order${ordersPick.length > 1 ? 's' : ''} added · ${n} line${n === 1 ? '' : 's'}`, { variant: 'success' });
      setOrdersOpen(false);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setOrdersLoading(false);
    }
  };
  const removeOrder = (oid: string) => {
    setLines((ls) => ls.filter((l) => l.salesOrder !== oid));
    const no = orderInfo[oid]?.number;
    if (no) setShortages((x) => x.filter((s) => s.orderNo !== no));
  };
  const orderDates = [...new Set(billOrders.map((o) => orderInfo[o]?.date && isoDate(orderInfo[o].date)).filter(Boolean) as string[])].sort();

  // ---- computed ----
  const computed = useMemo(() => lines.map((l) => calcLine(l, inter, cd)), [lines, inter, cd]);
  const totals = useMemo(() => calcTotals(computed, Number(freight) || 0, roundOff), [computed, freight, roundOff]);
  const cnTotal = Object.values(cnAdjust).reduce((s, v) => s + (Number(v) || 0), 0);

  const inCart = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.batch._id] = (m[l.batch._id] || 0) + l.qty + l.freeQty;
    return m;
  }, [lines]);
  // Batch stock available to this bill: live stock, less what open orders
  // hold (except this bill's own order), plus what this bill holds when editing.
  const availableOf = (b: Batch) => b.qty - Math.max(0, (b.reservedQty || 0) - (orderHeld[b._id] || 0)) + (heldByBill[b._id] || 0) - (inCart[b._id] || 0);

  // ---- server-side preview for rule warnings ----
  const previewKey = useDebounced(JSON.stringify({ p: party?._id, d: date, l: lines.map((l) => [l.batch._id, l.qty, l.freeQty, l.rate, l.discountPct]), cd, f: freight }), 600);
  useEffect(() => {
    if (!party || !lines.length) { setWarnings([]); return; }
    api.post('/sales/preview', { ...payload(), invoiceId: id })
      .then((r) => setWarnings(r.data.data.warnings || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  // ---- entry row ----
  // Auto mode: take the FEFO batch straight away and list every batch under
  // the entry row. The window only opens when no batch can be sold normally
  // (all short-expiry), so the operator decides consciously.
  const onProductPicked = async (p: ProductOption | null) => {
    setEntryProduct(p);
    setEntryBatch(null);
    if (!p) return;
    if (batchMode === 'ask') { setPickerFor(p._id); return; }
    const seq = ++pickSeq.current;
    setEntryLoading(true);
    try {
      const r = await api.get(`/products/${p._id}/batches`, { params: { party: party?._id } });
      if (seq !== pickSeq.current) return;
      const all = r.data.data as Batch[];
      const fefo = fefoPick(all, availableOf);
      if (fefo) onBatchPicked(fefo, r.data.product, all, r.data.minExpiryDays);
      else if (all.some((b) => !b.isExpired && !b.isBlocked && availableOf(b) > 0)) {
        enqueueSnackbar(`Only short-expiry stock of ${p.name} — choose the batch.`, { variant: 'warning' });
        setPickerFor(p._id);
      } else {
        enqueueSnackbar(`No stock of ${p.name}${all.length ? ' left to sell' : ''}.`, { variant: 'warning' });
        resetEntry();
      }
    } catch (e) {
      if (seq === pickSeq.current) enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      if (seq === pickSeq.current) setEntryLoading(false);
    }
  };

  const onBatchPicked = (batch: Batch, product: Product, all: Batch[], minExpiryDays?: number) => {
    setPickerFor(null);
    setEntryBatch((cur) => ({ batch, product, all, minExpiryDays: minExpiryDays ?? cur?.minExpiryDays }));
    setEntry((e) => ({ qty: e.qty && entryBatch?.product._id === product._id ? e.qty : '', freeQty: '', rate: String(batch.quote?.rate ?? batch.ptr), discountPct: String(batch.quote?.discountPct || '') }));
    setFreeTouched(false);
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);
  };

  // Switch the entry row to another batch from the inline list.
  const switchEntryBatch = (b: Batch) => {
    if (!entryBatch) return;
    onBatchPicked(b, entryBatch.product, entryBatch.all);
    const q = Number(entry.qty) || 0;
    if (q) setEntry((e) => ({ ...e, freeQty: String(schemeFree(q, b.quote?.schemeBuy || 0, b.quote?.schemeFree || 0) || '') }));
  };

  // Change the batch of a line already on the bill. A rate the operator
  // typed is kept; a rate that was just the old batch's quote follows the new batch.
  const onLineBatchPicked = (b: Batch) => {
    const l = changeLine;
    setChangeLine(null);
    if (!l) return;
    const followRate = l.rate === (l.batch.quote?.rate ?? l.rate);
    updateLine(l.key, {
      batch: b, rate: followRate ? b.quote?.rate ?? l.rate : l.rate,
      discountPct: followRate ? b.quote?.discountPct ?? l.discountPct : l.discountPct,
      schemeBuy: b.quote?.schemeBuy || 0, schemeFree: b.quote?.schemeFree || 0,
    });
    if (b.mrp !== l.batch.mrp) enqueueSnackbar(`MRP changes from ${amt(l.batch.mrp)} to ${amt(b.mrp)} on this line.`, { variant: 'info' });
  };

  const resetEntry = () => {
    pickSeq.current++;
    setEntryProduct(null); setEntryBatch(null); setEntryLoading(false); setEntry(emptyEntry); setFreeTouched(false);
    setTimeout(() => productRef.current?.focus(), 30);
  };

  const onEntryQty = (v: string) => {
    const q = Number(v) || 0;
    const sb = entryBatch?.batch.quote?.schemeBuy || 0, sf = entryBatch?.batch.quote?.schemeFree || 0;
    setEntry((e) => ({ ...e, qty: v, freeQty: freeTouched ? e.freeQty : String(schemeFree(q, sb, sf) || '') }));
  };

  // Adds the entry row. If the chosen batch can't cover the qty, the rest
  // spills into the next batches FEFO — the operator never has to split by hand.
  const addEntry = () => {
    if (!entryBatch) return;
    const qty = Number(entry.qty);
    if (!(qty > 0)) { qtyRef.current?.focus(); return; }
    let free = Number(entry.freeQty) || 0;
    const rate = Number(entry.rate);
    const disc = Number(entry.discountPct) || 0;
    const { product, all } = entryBatch;
    const order = [entryBatch.batch, ...all.filter((b) => b._id !== entryBatch.batch._id && !b.isExpired && !b.isBlocked && !b.isNearExpiry)];
    let need = qty;
    const add: Line[] = [];
    for (const b of order) {
      if (need <= 0) break;
      const avail = availableOf(b);
      if (avail <= 0) continue;
      const take = Math.min(need, avail);
      const thisFree = Math.min(free, Math.max(0, avail - take));
      free -= thisFree;
      add.push({
        key: nextKey(), productId: product._id, productName: product.name, manufacturerName: product.manufacturerName, packing: product.packing,
        schedule: product.schedule, gstRate: product.gstRate, batch: b, qty: take, freeQty: thisFree,
        rate: b._id === entryBatch.batch._id ? rate : b.quote?.rate ?? rate, discountPct: disc,
        schemeBuy: b.quote?.schemeBuy || 0, schemeFree: b.quote?.schemeFree || 0,
      });
      need -= take;
    }
    if (!add.length) { enqueueSnackbar(`No stock left for ${product.name}.`, { variant: 'warning' }); return; }
    if (need > 0) enqueueSnackbar(`Only ${qty - need} of ${qty} available for ${product.name}. Added what's in stock.`, { variant: 'warning' });
    else if (add.length > 1) enqueueSnackbar(`Split across ${add.length} batches (FEFO).`, { variant: 'info' });
    if (free > 0) enqueueSnackbar(`Not enough stock for ${free} free — reduced.`, { variant: 'warning' });
    setLines((ls) => [...ls, ...add]);
    resetEntry();
  };

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const nextOnEnter = (next: React.RefObject<HTMLInputElement>, action?: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (action) action(); else next.current?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); resetEntry(); }
  };

  // ---- save ----
  const payload = (override = false) => ({
    date, party: party?._id, paymentMode, cdPct: cd, freight: Number(freight) || 0, narration, salesman: salesman || undefined, salesOrder: billOrders[0], salesOrders: billOrders,
    boxes: Number(transport.boxes) || 0,
    transport: { transporterName: transport.transporterName, vehicleNo: transport.vehicleNo, lrNo: transport.lrNo, distanceKm: Number(transport.distanceKm) || 0 },
    items: lines.map((l) => ({ product: l.productId, batch: l.batch._id, qty: l.qty, freeQty: l.freeQty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, orderItem: l.orderItem, salesOrder: l.salesOrder })),
    creditNoteAdjustments: Object.entries(cnAdjust).filter(([, v]) => Number(v) > 0).map(([doc, amount]) => ({ doc, amount: Number(amount) })),
    override,
  });

  const save = async (override = false) => {
    if (saving) return;
    if (!party) { enqueueSnackbar('Choose the customer first.', { variant: 'warning' }); partyRef.current?.focus(); return; }
    if (!lines.length) { enqueueSnackbar('Add at least one item.', { variant: 'warning' }); productRef.current?.focus(); return; }
    if (cnTotal > totals.grand + 0.01) { enqueueSnackbar('Credit notes adjusted are more than the bill.', { variant: 'warning' }); return; }
    setSaving(true);
    try {
      const r = id ? await api.put(`/sales/${id}`, payload(override)) : await api.post('/sales', payload(override));
      setBlocked(null);
      setSaved(r.data.data);
      draft.clear();
      enqueueSnackbar(`Bill ${r.data.data.number} saved · ${inr(r.data.data.grandTotal)}`, { variant: 'success' });
    } catch (e) {
      const body = errBody(e);
      if (body?.code === 'RULES_BLOCKED') setBlocked(body.details?.warnings || []);
      else enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useHotkey('f2', () => save());
  useHotkey('ctrl+s', () => save());
  useHotkey('f3', () => productRef.current?.focus());
  useHotkey('f4', () => partyRef.current?.focus());
  useHotkey('f6', () => { if (entryProduct) setPickerFor(entryProduct._id); }, [entryProduct]);

  const newBill = () => {
    setSaved(null); setLines([]); setParty(null); setPartyInfo(null); setNarration(''); setFreight(''); setCdPct(''); setCnAdjust({});
    setOrderInfo({}); setOrderHeld({}); setShortages([]); setTransport({ boxes: '', transporterName: '', vehicleNo: '', lrNo: '', distanceKm: '' }); setPaymentMode('credit');
    setDocNumber(''); setHeldByBill({});
    if (id || sp.toString()) nav('/sales/new');
    setTimeout(() => partyRef.current?.focus(), 50);
  };

  const shareWhatsApp = (inv: Voucher) => {
    const lines = [
      `*${business?.name}*`, `Bill ${inv.number} dt. ${fdate(inv.date)}`, `Amount: ${inr(inv.grandTotal)} (${inv.items.length} items)`,
      inv.paymentMode === 'credit' ? `Due by ${fdate(inv.dueDate)}` : 'Paid in cash', business?.upiId ? `UPI: ${business.upiId}` : '', 'Thank you!',
    ].filter(Boolean);
    openWhatsApp(partyInfo?.data.mobile || partyInfo?.data.phone, lines.join('\n'));
  };

  const p = partyInfo?.data;
  const s = partyInfo?.summary;
  const blockingNow = warnings.filter((w) => w.action === 'block');

  return (
    <>
      <PageHeader
        help={['fefo', 'batch', 'ptr', 'scheme', 'disc', 'cd', 'creditlimit', 'overdue', 'reserved', 'igst', 'dl']}
        title={id ? `Edit Bill ${docNumber}` : 'New Sales Bill'}
        crumbs={[{ label: 'Sales', to: '/sales' }, { label: id ? 'Edit' : 'New' }]}
        subtitle="Choose the customer → add products → save.  Keys: F4 customer · F3 product · F2 save"
        actions={
          <>
            <DraftStatus draft={draft} />
            <Button onClick={() => nav(-1)}>Close</Button>
            <Button variant="contained" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
          </>
        }
      />

      <DraftBanner draft={draft} label={draftLabel} onDiscard={discardDraft} onOpen={() => { if (sp.toString()) nav('/sales/new', { replace: true }); }} />

      <Grid container spacing={1.5}>
        {/* ---------- left: header + items ---------- */}
        <Grid item xs={12} lg={9}>
          <Paper sx={{ p: 1.5, mb: 1.5 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} md={5}>
                <PartyPicker type="customer" value={party} onChange={(v) => { if (v?._id !== party?._id) { setLines((ls) => ls.filter((l) => !l.salesOrder)); setShortages([]); } setParty(v); setCnAdjust({}); if (v) setTimeout(() => productRef.current?.focus(), 80); }} inputRef={partyRef} label="Customer (F4)" disabled={!!id} quickCreate />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField type="date" label="Bill date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
                  sx={date !== today() ? { '& .MuiOutlinedInput-root': { bgcolor: 'rgba(199,119,0,0.06)' } } : undefined}
                  helperText={date !== today() ? (
                    <Box component="span" sx={{ display: 'flex', gap: 0.75 }}>
                      <Box component="span" sx={{ color: 'warning.dark', fontWeight: 600 }}>{date < today() ? 'Back-dated' : 'Future date'}</Box>
                      <Box component="span" role="button" onClick={() => setDate(today())} sx={{ cursor: 'pointer', color: 'primary.main', textDecoration: 'underline' }}>Today</Box>
                    </Box>
                  ) : undefined} />
              </Grid>
              <Grid item xs={6} md={2}>
                <ToggleButtonGroup exclusive fullWidth size="small" value={paymentMode} onChange={(_, v) => v && setPaymentMode(v)}>
                  <ToggleButton value="credit">Credit</ToggleButton>
                  <ToggleButton value="cash">Cash</ToggleButton>
                </ToggleButtonGroup>
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField select label="Salesman" value={salesman} onChange={(e) => setSalesman(e.target.value)} fullWidth>
                  <MenuItem value="">—</MenuItem>
                  {users.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={1}>
                <TextField label="CD %" value={cdPct === '' ? (p?.cashDiscountPct || '') : cdPct} onChange={(e) => setCdPct(e.target.value)} fullWidth inputProps={{ inputMode: 'decimal' }} />
              </Grid>
            </Grid>

            {p && (
              <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                <Chip label={`Balance ${drcr(p.balance)}`} color={p.balance > 0 ? 'warning' : 'default'} variant="outlined" />
                {p.creditLimit > 0 && <Chip label={`Limit ${amt(p.creditLimit)} · Avail ${amt(s?.creditAvailable ?? 0)}`} color={(s?.creditAvailable ?? 0) < totals.grand ? 'error' : 'default'} variant="outlined" />}
                <Chip label={`${p.creditDays} days credit`} variant="outlined" />
                {(s?.overdue || 0) > 0 && <Chip label={`Overdue ${amt(s?.overdue)}`} color="error" />}
                {p.gstin ? <Chip label={p.gstin} variant="outlined" /> : <Chip label="Unregistered" variant="outlined" />}
                <Chip label={inter ? 'Inter-state · IGST' : 'Local · CGST+SGST'} color={inter ? 'info' : 'default'} variant="outlined" />
                {s?.dlExpired && <Chip label="DL EXPIRED" color="error" />}
                {!p.dl20b && !p.dl21b && <Chip label="No DL on file" color="warning" />}
                {p.isHold && <Chip label={`ON HOLD ${p.holdReason || ''}`} color="error" />}
                {s?.lastBill && <Typography fontSize={11} color="text.secondary">Last bill {s.lastBill.number} · {fdate(s.lastBill.date)} · {inr(s.lastBill.grandTotal)}</Typography>}
              </Box>
            )}
          </Paper>

          {party && (billOrders.length > 0 || otherPending.length > 0) && (
            <Paper sx={{ p: 1.25, mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', bgcolor: 'rgba(15,92,140,0.03)' }}>
              <Typography fontSize={12.5} fontWeight={600} sx={{ mr: 0.5 }}>{billOrders.length ? `Orders on this bill (${billOrders.length})` : 'Orders'}</Typography>
              {billOrders.map((o) => {
                const info = orderInfo[o];
                const d = info?.date ? isoDate(info.date) : '';
                return (
                  <Tooltip key={o} title={d && d !== date ? 'Click to date the bill on this order’s date' : ''}>
                    <Chip color="primary" label={info ? `${info.number} · ${fdate(info.date)}` : 'Order'} onClick={d && d !== date ? () => setDate(d) : undefined}
                      onDelete={() => removeOrder(o)} />
                  </Tooltip>
                );
              })}
              {otherPending.length > 0 && (
                <Button size="small" variant="outlined" onClick={openOrders} sx={{ ml: billOrders.length ? 0.5 : 0 }}>
                  + {billOrders.length ? `${otherPending.length} more pending` : `Add pending orders (${otherPending.length})`}
                </Button>
              )}
              {orderDates.length > 1 && (
                <Typography fontSize={11.5} color="text.secondary" sx={{ ml: 'auto' }}>
                  Orders from {fdate(orderDates[0])} to {fdate(orderDates[orderDates.length - 1])} · bill dated {fdate(date)}
                </Typography>
              )}
            </Paper>
          )}

          {shortages.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setShortages([])}>
              Short on {billOrders.length > 1 ? 'these orders' : 'this order'}: {shortages.map((x) => `${x.productName} (${x.short}${billOrders.length > 1 && x.orderNo ? `, ${x.orderNo}` : ''})`).join(', ')}
            </Alert>
          )}

          {/* entry row */}
          <Paper sx={{ p: 1.5, mb: 1.5, borderColor: 'primary.light' }}>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={12} md={4.5}>
                <ProductPicker value={entryProduct} onChange={onProductPicked} inputRef={productRef} label="Product (F3)" placeholder="Type name, salt or scan barcode" disabled={!party} />
              </Grid>
              <Grid item xs={12} md={2}>
                {entryBatch ? (
                  <Tooltip title="Change batch (F6)">
                    <Box sx={{ cursor: 'pointer' }} onClick={() => entryProduct && setPickerFor(entryProduct._id)}>
                      <Typography fontSize={12} fontWeight={700}>{entryBatch.batch.batchNo} · {fexp(entryBatch.batch.expiry)}</Typography>
                      <Typography fontSize={11} color="text.secondary">MRP {amt(entryBatch.batch.mrp)} · stock {availableOf(entryBatch.batch)}</Typography>
                    </Box>
                  </Tooltip>
                ) : <Typography fontSize={12} color="text.secondary">{entryLoading ? 'Loading batches…' : batchMode === 'auto' ? 'Batch: FEFO auto' : 'Batch: pick product'}</Typography>}
              </Grid>
              <Grid item xs={3} md={1.2}><TextField label="Qty" value={entry.qty} inputRef={qtyRef} onChange={(e) => onEntryQty(e.target.value)} onKeyDown={nextOnEnter(freeRef)} disabled={!entryBatch} inputProps={{ inputMode: 'numeric' }} /></Grid>
              <Grid item xs={3} md={1.1}><TextField label="Free" value={entry.freeQty} inputRef={freeRef} onChange={(e) => { setFreeTouched(true); setEntry({ ...entry, freeQty: e.target.value }); }} onKeyDown={nextOnEnter(rateRef)} disabled={!entryBatch} /></Grid>
              <Grid item xs={3} md={1.2}><TextField label="Rate" value={entry.rate} inputRef={rateRef} onChange={(e) => setEntry({ ...entry, rate: e.target.value })} onKeyDown={nextOnEnter(discRef)} disabled={!entryBatch} /></Grid>
              <Grid item xs={3} md={1}><TextField label="Disc %" value={entry.discountPct} inputRef={discRef} onChange={(e) => setEntry({ ...entry, discountPct: e.target.value })} onKeyDown={nextOnEnter(discRef, addEntry)} disabled={!entryBatch} /></Grid>
              <Grid item xs={12} md={1}><Button fullWidth variant="outlined" onClick={addEntry} disabled={!entryBatch}>Add</Button></Grid>
            </Grid>
            {entryBatch && batchMode === 'auto' && (
              <Box sx={{ mt: 1 }}>
                <BatchStrip batches={entryBatch.all} selectedId={entryBatch.batch._id} leftOf={availableOf} onSelect={switchEntryBatch} minExpiryDays={entryBatch.minExpiryDays} />
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
              <ToggleButtonGroup size="small" exclusive value={batchMode} onChange={(_, v) => v && toggleBatchMode(v)} sx={{ '& .MuiToggleButton-root': { py: 0, px: 1, fontSize: 11 } }}>
                <ToggleButton value="auto">Auto FEFO</ToggleButton>
                <ToggleButton value="ask">Ask batch</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Paper>

          {/* lines */}
          <Paper sx={{ overflow: 'auto' }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell>
                  <TableCell align="right">MRP</TableCell><TableCell align="right" width={70}>Qty</TableCell><TableCell align="right" width={60}>Free</TableCell>
                  <TableCell align="right" width={85}>Rate</TableCell><TableCell align="right" width={60}>Disc%</TableCell><TableCell align="right">GST</TableCell>
                  <TableCell align="right">Taxable</TableCell><TableCell align="right">Amount</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l, i) => {
                  const c = computed[i];
                  const over = availableOf(l.batch) < 0;
                  const lowMargin = l.batch.landingCost && l.rate * (1 - l.discountPct / 100) < l.batch.landingCost;
                  return (
                    <TableRow key={l.key} hover sx={{ bgcolor: over ? 'rgba(211,47,47,0.06)' : undefined }}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Typography component="div" fontSize={13} fontWeight={600}>{l.productName} {l.schedule !== 'None' && <Chip label={l.schedule} color="warning" sx={{ height: 16, fontSize: 10 }} />}</Typography>
                        <Typography fontSize={11} color="text.secondary">{l.manufacturerName} · {l.packing}{billOrders.length > 1 && l.salesOrder && orderInfo[l.salesOrder] ? ` · ${orderInfo[l.salesOrder].number}` : ''}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Change batch">
                          <Box component="span" onClick={() => setChangeLine(l)} sx={{ cursor: 'pointer', borderBottom: '1px dashed', borderColor: 'text.disabled', '&:hover': { color: 'primary.main' } }}>{l.batch.batchNo}</Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ color: l.batch.isNearExpiry ? 'warning.dark' : undefined }}>{fexp(l.batch.expiry)}</TableCell>
                      <TableCell align="right">{amt(l.batch.mrp)}</TableCell>
                      <TableCell align="right"><CellInput value={l.qty} onChange={(v) => updateLine(l.key, { qty: v, freeQty: schemeFree(v, l.schemeBuy, l.schemeFree) || l.freeQty })} error={over} /></TableCell>
                      <TableCell align="right"><CellInput value={l.freeQty} onChange={(v) => updateLine(l.key, { freeQty: v })} /></TableCell>
                      <TableCell align="right">
                        <Tooltip title={lowMargin ? `Below landing cost ${amt(l.batch.landingCost)}` : ''}>
                          <span><CellInput value={l.rate} onChange={(v) => updateLine(l.key, { rate: v })} error={!!lowMargin} decimal /></span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right"><CellInput value={l.discountPct} onChange={(v) => updateLine(l.key, { discountPct: v })} decimal /></TableCell>
                      <TableCell align="right">{l.gstRate}%</TableCell>
                      <TableCell align="right">{amt(c.taxable)}</TableCell>
                      <TableCell align="right"><b>{amt(c.total)}</b></TableCell>
                      <TableCell><IconButton onClick={() => removeLine(l.key)}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  );
                })}
                {!lines.length && (
                  <TableRow><TableCell colSpan={13}><Typography color="text.secondary" textAlign="center" py={3}>{party ? 'Search a product above (F3) — batches open FEFO with this party’s rate.' : 'Start by choosing the customer (F4).'}</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField label="Narration / remarks" value={narration} onChange={(e) => setNarration(e.target.value)} sx={{ flex: 1, minWidth: 260 }} />
            <Button startIcon={<LocalShippingOutlinedIcon />} onClick={() => setShowTransport((x) => !x)}>Transport / cases</Button>
          </Box>
          <Collapse in={showTransport}>
            <Paper sx={{ p: 1.5, mt: 1 }}>
              <Grid container spacing={1}>
                <Grid item xs={6} md={2}><TextField label="Cases / boxes" value={transport.boxes} onChange={(e) => setTransport({ ...transport, boxes: e.target.value })} fullWidth /></Grid>
                <Grid item xs={6} md={3}><TextField label="Transporter" value={transport.transporterName} onChange={(e) => setTransport({ ...transport, transporterName: e.target.value })} fullWidth /></Grid>
                <Grid item xs={6} md={3}><TextField label="Vehicle no" value={transport.vehicleNo} onChange={(e) => setTransport({ ...transport, vehicleNo: e.target.value.toUpperCase() })} fullWidth /></Grid>
                <Grid item xs={6} md={2}><TextField label="LR no" value={transport.lrNo} onChange={(e) => setTransport({ ...transport, lrNo: e.target.value })} fullWidth /></Grid>
                <Grid item xs={6} md={2}><TextField label="Distance km" value={transport.distanceKm} onChange={(e) => setTransport({ ...transport, distanceKm: e.target.value })} fullWidth /></Grid>
              </Grid>
              {totals.grand >= (business?.settings?.ewayBillThreshold || 50000) && <Typography fontSize={12} color="warning.dark" mt={1}>Bill value ≥ ₹{business?.settings?.ewayBillThreshold || 50000}: an e-way bill is required for movement of goods.</Typography>}
            </Paper>
          </Collapse>
        </Grid>

        {/* ---------- right: totals ---------- */}
        <Grid item xs={12} lg={3}>
          <Paper sx={{ p: 1.5, position: { lg: 'sticky' }, top: { lg: 64 } }}>
            {warnings.length > 0 && (
              <Box sx={{ mb: 1.5, display: 'grid', gap: 0.75 }}>
                {warnings.map((w, i) => (
                  <Alert key={i} severity={w.action === 'block' ? 'error' : 'warning'} icon={<WarningAmberIcon fontSize="small" />} sx={{ py: 0, fontSize: 12 }}>{w.message}</Alert>
                ))}
              </Box>
            )}
            <Row label="Items" value={`${lines.length} · qty ${lines.reduce((s, l) => s + l.qty, 0)} + ${lines.reduce((s, l) => s + l.freeQty, 0)} free`} />
            <Row label="Gross" value={amt(totals.gross)} />
            {totals.disc > 0 && <Row label="Trade discount" value={`− ${amt(totals.disc)}`} />}
            {totals.cd > 0 && <Row label={`Cash discount ${cd}%`} value={`− ${amt(totals.cd)}`} />}
            <Row label="Taxable" value={amt(totals.taxable)} />
            {inter ? <Row label="IGST" value={amt(totals.igst)} /> : <><Row label="CGST" value={amt(totals.cgst)} /><Row label="SGST" value={amt(totals.sgst)} /></>}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', my: 0.5 }}>
              <Typography fontSize={13} color="text.secondary">Freight</Typography>
              <TextField value={freight} onChange={(e) => setFreight(e.target.value)} sx={{ width: 100 }} inputProps={{ style: { textAlign: 'right' }, inputMode: 'decimal' }} />
            </Box>
            {totals.roundOff !== 0 && <Row label="Round off" value={amt(totals.roundOff)} />}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography fontWeight={700}>Bill total</Typography>
              <Typography fontWeight={800} fontSize={24} color="primary.dark">{inr(totals.grand)}</Typography>
            </Box>

            {(s?.openNotes?.length || 0) > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography fontSize={12} fontWeight={600} mb={0.5}>Adjust credit notes</Typography>
                {s!.openNotes.map((n) => (
                  <Box key={n._id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      sx={{ flex: 1, m: 0 }}
                      control={<Checkbox size="small" checked={(cnAdjust[n._id] || 0) > 0} onChange={(e) => setCnAdjust({ ...cnAdjust, [n._id]: e.target.checked ? Math.min(n.balance, Math.max(0, totals.grand - cnTotal)) : 0 })} />}
                      label={<Typography fontSize={12}>{n.number} · {inr(n.balance)}</Typography>}
                    />
                    {(cnAdjust[n._id] || 0) > 0 && <TextField value={cnAdjust[n._id]} onChange={(e) => setCnAdjust({ ...cnAdjust, [n._id]: Math.min(n.balance, Number(e.target.value) || 0) })} sx={{ width: 90 }} />}
                  </Box>
                ))}
                {cnTotal > 0 && <Row label="Net receivable" value={inr(totals.grand - cnTotal)} />}
              </Box>
            )}
            <Button fullWidth variant="contained" size="large" sx={{ mt: 1.5 }} onClick={() => save()} disabled={saving || !party || !lines.length}>
              {saving ? 'Saving…' : blockingNow.length && can('sales:override') ? 'Save (needs override)' : 'Save bill (F2)'}
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <BatchPicker productId={pickerFor} partyId={party?._id} inCart={inCart} leftOf={availableOf} autoSingle={batchMode === 'ask' && !entryBatch}
        onClose={() => { setPickerFor(null); setTimeout(() => (entryBatch ? qtyRef : productRef).current?.focus(), 30); }} onPick={(b, p, all) => onBatchPicked(b, p, all)} />
      <BatchPicker productId={changeLine?.productId || null} partyId={party?._id} title={changeLine ? `Change batch ${changeLine.batch.batchNo}` : undefined}
        inCart={inCart} leftOf={(b) => availableOf(b) + (changeLine && b._id === changeLine.batch._id ? changeLine.qty + changeLine.freeQty : 0)}
        onClose={() => setChangeLine(null)} onPick={(b) => onLineBatchPicked(b)} />

      {/* pending orders of this customer → one bill */}
      <Dialog open={ordersOpen} onClose={() => setOrdersOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>
          Pending orders — {party?.name}
          <Typography fontSize={12} color="text.secondary">Tick the orders to supply on this bill. The bill date stays your choice.</Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 1.5 }}>
          {otherPending.length > 1 && (
            <FormControlLabel sx={{ ml: 0.25 }}
              control={<Checkbox checked={ordersPick.length === otherPending.length} indeterminate={ordersPick.length > 0 && ordersPick.length < otherPending.length}
                onChange={(e) => setOrdersPick(e.target.checked ? otherPending.map((o) => o._id) : [])} />}
              label={<Typography fontSize={13} fontWeight={600}>All {otherPending.length} orders</Typography>} />
          )}
          {otherPending.map((o) => {
            const on = ordersPick.includes(o._id);
            const pend = (o.items || []).filter((i) => i.qty > (i.fulfilledQty || 0)).length;
            return (
              <Box key={o._id} onClick={() => setOrdersPick((x) => (on ? x.filter((y) => y !== o._id) : [...x, o._id]))}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, py: 0.5, borderRadius: 1.5, cursor: 'pointer', bgcolor: on ? 'rgba(15,92,140,0.06)' : undefined, '&:hover': { bgcolor: 'rgba(15,92,140,0.08)' } }}>
                <Checkbox checked={on} sx={{ p: 0.75 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={13.5} fontWeight={600}>{o.number} <Typography component="span" fontSize={12} color="text.secondary">· {fdate(o.date)}</Typography></Typography>
                  <Typography fontSize={12} color="text.secondary">{pend} item{pend === 1 ? '' : 's'} pending{o.status === 'partial' ? ' · part supplied' : ''}{o.salesmanName ? ` · ${o.salesmanName}` : ''}</Typography>
                </Box>
                <Typography fontSize={13} fontWeight={600}>{inr(pendingValue(o))}</Typography>
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Typography fontSize={12} color="text.secondary" sx={{ mr: 'auto', pl: 1 }}>
            {ordersPick.length ? `${ordersPick.length} selected · ~${inr(otherPending.filter((o) => ordersPick.includes(o._id)).reduce((s, o) => s + pendingValue(o), 0))}` : 'None selected'}
          </Typography>
          <Button onClick={() => setOrdersOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmOrders} disabled={!ordersPick.length || ordersLoading}>{ordersLoading ? 'Adding…' : 'Add to bill'}</Button>
        </DialogActions>
      </Dialog>

      {/* rule block dialog */}
      <Dialog open={!!blocked} onClose={() => setBlocked(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Bill blocked by business rules</DialogTitle>
        <DialogContent>
          {blocked?.map((w, i) => <Alert key={i} severity="error" sx={{ mb: 1 }}>{w.message}</Alert>)}
          <Typography fontSize={13} color="text.secondary">
            {can('sales:override') ? 'You can override these as a supervisor — the override is recorded on the bill and in the audit log.' : 'Ask an owner/admin to override, or change the bill.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlocked(null)}>Back to bill</Button>
          {can('sales:override') && <Button color="error" variant="contained" onClick={() => save(true)}>Override & save</Button>}
        </DialogActions>
      </Dialog>

      {/* saved dialog */}
      <Dialog open={!!saved} maxWidth="xs" fullWidth onKeyDown={(e) => {
        if (!saved) return;
        if (e.key.toLowerCase() === 'p' && business) printVoucher(saved, business, 'sale');
        if (e.key.toLowerCase() === 'n') newBill();
      }}>
        <DialogTitle>Bill saved</DialogTitle>
        <DialogContent>
          <Alert severity="success" icon={false}>
            <AlertTitle sx={{ fontSize: 18 }}>{saved?.number}</AlertTitle>
            {saved?.partyName} · <b>{inr(saved?.grandTotal)}</b>{saved?.paymentMode === 'cash' ? ' · paid cash' : ` · due ${fdate(saved?.dueDate)}`}
            {saved?.warningsOverridden?.length ? <Typography fontSize={12} mt={0.5}>Overrode: {saved.warningsOverridden.join(', ')}</Typography> : null}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => saved && business && printVoucher(saved, business, 'sale')} variant="outlined" autoFocus>Print (P)</Button>
          <Button onClick={() => saved && shareWhatsApp(saved)} variant="outlined">WhatsApp</Button>
          <Button onClick={() => saved && nav(`/sales/${saved._id}`)}>Open</Button>
          <Button onClick={newBill} variant="contained">New bill (N)</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography fontSize={13} color="text.secondary">{label}</Typography>
    <Typography fontSize={13} fontWeight={500}>{value}</Typography>
  </Box>
);

// Inline numeric cell: keeps its own text so "12." can be typed, commits numbers.
function CellInput({ value, onChange, error, decimal }: { value: number; onChange: (v: number) => void; error?: boolean; decimal?: boolean }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => { if (Number(text) !== value) setText(String(value ?? '')); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextField
      value={text}
      error={error}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(n); }}
      variant="standard"
      inputProps={{ style: { textAlign: 'right', fontSize: 13, padding: '2px 0' }, inputMode: decimal ? 'decimal' : 'numeric' }}
      InputProps={{ disableUnderline: !error }}
      sx={{ width: '100%', '& input:focus': { bgcolor: 'rgba(15,92,140,0.06)' } }}
    />
  );
}
