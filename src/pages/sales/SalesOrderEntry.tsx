import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  FormControlLabel, InputAdornment, LinearProgress, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useHotkey } from '../../lib/hooks';
import { amt, fdate, fexp, isoDate, num, round2, today } from '../../lib/format';
import { openWhatsApp } from '../../lib/whatsapp';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Batch, Party, Product } from '../../lib/types';
import { Order, SOURCES, itemReserveTarget, itemReserved, orderWhatsAppText, reservationSummary } from './orderUtils';
import dayjs from 'dayjs';

interface Line {
  key: string; _id?: string; product: string; productName: string; manufacturerName: string; packing: string;
  // stock = free (unreserved) stock; held = what this order already holds.
  stock?: number; held?: number; reservations?: Order['items'][number]['reservations']; nearestExpiry?: string | null; gstRate?: number; ptr?: number; mrp?: number;
  partyRate?: number; partyDisc?: number; schemeBuy?: number; schemeFree?: number;
  qty: string; freeQty: string; rate: string; discountPct: string; remark: string; fulfilledQty: number;
}

interface PartyInfo {
  data: Party;
  summary: { outstanding: number; overdue: number; creditAvailable: number | null; lastBill?: { number: string; date: string; grandTotal: number } | null };
}

let seq = 0;
const nextKey = () => `l${++seq}`;
const n = (s: string | number | undefined) => Number(s) || 0;

const effRate = (l: Line) => (l.rate !== '' ? n(l.rate) : l.partyRate ?? l.ptr ?? 0);
const effDisc = (l: Line) => (l.discountPct !== '' ? n(l.discountPct) : l.partyDisc ?? 0);
const lineAmount = (l: Line) => round2(n(l.qty) * effRate(l) * (1 - effDisc(l) / 100) * (1 + (l.gstRate ?? 0) / 100));

// Product + party-specific quote (rate type, special rate, scheme) via the batch endpoint.
const productInfo = async (productId: string, partyId?: string) => {
  const r = await api.get(`/products/${productId}/batches`, { params: { party: partyId } });
  const p = r.data.product as Product;
  const batches = r.data.data as Batch[];
  const q = batches[0]?.quote;
  return {
    gstRate: p.gstRate, ptr: p.ptr, mrp: p.mrp, packing: p.packing, manufacturerName: p.manufacturerName,
    stock: batches.reduce((s, b) => s + Math.max(0, (b.qty || 0) - (b.reservedQty || 0)), 0), nearestExpiry: batches[0]?.expiry || null,
    partyRate: q?.rate, partyDisc: q?.discountPct, schemeBuy: q?.schemeBuy ?? p.schemeBuy, schemeFree: q?.schemeFree ?? p.schemeFree,
  };
};

const schemeFreeFor = (qty: number, buy?: number, free?: number) => (buy && free && qty >= buy ? Math.floor(qty / buy) * free : 0);

const emptyDraft = () => ({ product: null as ProductOption | null, qty: '', freeQty: '', rate: '', discountPct: '', remark: '', freeTouched: false, info: null as Awaited<ReturnType<typeof productInfo>> | null, loading: false });

export default function SalesOrderEntry() {
  const { id } = useParams();
  const nav = useNavigate();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const { can, user, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [order, setOrder] = useState<Order | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(!!id);
  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyInfo, setPartyInfo] = useState<PartyInfo | null>(null);
  const [date, setDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState('');
  const [source, setSource] = useState(user?.role === 'salesman' ? 'salesman' : 'phone');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Order | null>(null);
  const [dirty, setDirty] = useState(false);
  const holdDefault = () => dayjs().add(business?.settings?.reserveDays || 7, 'day').format('YYYY-MM-DD');
  const [reserve, setReserve] = useState(business?.settings?.reserveOnOrder ?? true);
  const [holdUntil, setHoldUntil] = useState(holdDefault);
  const [resBusy, setResBusy] = useState(false);

  const productRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const editable = id ? !!order && order.status === 'open' && can('sales_orders:edit') : can('sales_orders:create');

  // ---- load existing order ----
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoadingDoc(true);
    api.get(`/sales-orders/${id}`).then(async (r) => {
      const o = r.data.data as Order;
      if (!alive) return;
      setOrder(o);
      setParty({ _id: o.party, name: o.partyName });
      setDate(isoDate(o.date));
      setDeliveryDate(isoDate(o.deliveryDate));
      setSource(o.source || 'phone');
      setNarration(o.narration || '');
      setReserve(!!o.reserve);
      setHoldUntil(o.reserveUntil ? isoDate(o.reserveUntil) : holdDefault());
      const base: Line[] = o.items.map((i) => ({
        held: itemReserved(i), reservations: i.reservations,
        key: nextKey(), _id: i._id, product: i.product, productName: i.productName, manufacturerName: i.manufacturerName, packing: i.packing,
        qty: String(i.qty), freeQty: i.freeQty ? String(i.freeQty) : '', rate: String(i.rate ?? ''), discountPct: i.discountPct ? String(i.discountPct) : '',
        remark: i.remark || '', fulfilledQty: i.fulfilledQty || 0,
      }));
      setLines(base);
      setLoadingDoc(false);
      // Enrich with stock + GST so the estimate and stock hints are right.
      const infos = await Promise.allSettled([...new Set(base.map((l) => l.product))].map(async (pid) => [pid, await productInfo(pid, o.party)] as const));
      if (!alive) return;
      const map = new Map(infos.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])));
      setLines((ls) => ls.map((l) => { const inf = map.get(l.product); return inf ? { ...l, ...inf, packing: l.packing || inf.packing } : l; }));
    }).catch((e) => { enqueueSnackbar(errMsg(e), { variant: 'error' }); setLoadingDoc(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---- party details: outstanding / overdue / hold / DL ----
  useEffect(() => {
    setPartyInfo(null);
    if (!party?._id) return;
    let alive = true;
    api.get(`/parties/${party._id}`).then((r) => { if (alive) setPartyInfo(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [party?._id]);

  const changeParty = async (p: PartyOption | null) => {
    setParty(p);
    setDirty(true);
    if (!p || !lines.length) return;
    // Party rates differ (PTR/PTS/special rates) — refresh the quotes for lines already entered.
    const infos = await Promise.allSettled(lines.map(async (l) => [l.key, await productInfo(l.product, p._id)] as const));
    const map = new Map(infos.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])));
    setLines((ls) => ls.map((l) => { const inf = map.get(l.key); return inf ? { ...l, partyRate: inf.partyRate, partyDisc: inf.partyDisc } : l; }));
  };

  // ---- draft line (the "add item" composer) ----
  const pickProduct = async (p: ProductOption | null) => {
    if (!p) { setDraft(emptyDraft()); return; }
    setDraft({ ...emptyDraft(), product: p, loading: true });
    setTimeout(() => qtyRef.current?.focus(), 30);
    try {
      const info = await productInfo(p._id, party?._id);
      setDraft((d) => (d.product?._id === p._id ? { ...d, info, loading: false } : d));
    } catch {
      setDraft((d) => (d.product?._id === p._id ? { ...d, loading: false } : d));
    }
  };

  const setDraftQty = (v: string) => setDraft((d) => {
    const free = d.freeTouched ? d.freeQty : String(schemeFreeFor(n(v), d.info?.schemeBuy ?? d.product?.schemeBuy, d.info?.schemeFree ?? d.product?.schemeFree) || '');
    return { ...d, qty: v, freeQty: free === '0' ? '' : free };
  });

  const addDraft = () => {
    const p = draft.product;
    if (!p) { productRef.current?.focus(); return; }
    if (!(n(draft.qty) > 0)) { enqueueSnackbar('Enter quantity', { variant: 'warning' }); qtyRef.current?.focus(); return; }
    const info = draft.info;
    const existing = lines.find((l) => l.product === p._id);
    if (existing) {
      const free = n(existing.freeQty) + n(draft.freeQty);
      setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, qty: String(n(l.qty) + n(draft.qty)), freeQty: free ? String(free) : '' } : l)));
      enqueueSnackbar(`${p.name} was already on the order — quantity added`, { variant: 'info' });
    } else {
      setLines((ls) => [...ls, {
        key: nextKey(), product: p._id, productName: p.name, manufacturerName: p.manufacturerName, packing: p.packing,
        stock: info?.stock ?? p.stock, nearestExpiry: info?.nearestExpiry ?? p.nearestExpiry, gstRate: info?.gstRate ?? p.gstRate,
        ptr: info?.ptr ?? p.ptr, mrp: info?.mrp ?? p.mrp, partyRate: info?.partyRate, partyDisc: info?.partyDisc,
        schemeBuy: info?.schemeBuy ?? p.schemeBuy, schemeFree: info?.schemeFree ?? p.schemeFree,
        qty: draft.qty, freeQty: draft.freeQty, rate: draft.rate, discountPct: draft.discountPct, remark: draft.remark, fulfilledQty: 0,
      }]);
    }
    setDirty(true);
    setDraft(emptyDraft());
    setTimeout(() => productRef.current?.focus(), 30);
  };

  const updateLine = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setDirty(true); };
  const removeLine = (key: string) => { setLines((ls) => ls.filter((l) => l.key !== key)); setDirty(true); };

  const total = useMemo(() => round2(lines.reduce((s, l) => s + lineAmount(l), 0)), [lines]);
  const totalQty = lines.reduce((s, l) => s + n(l.qty), 0);

  // ---- auto-save (unsaved order survives leaving the screen / power cut) ----
  type OrderDraft = {
    party: PartyOption | null; date: string; deliveryDate: string; source: string; narration: string; lines: Line[];
    reserve: boolean; holdUntil: string; composer: { product: ProductOption | null; qty: string; freeQty: string; rate: string; discountPct: string; remark: string };
  };
  const composer = { product: draft.product, qty: draft.qty, freeQty: draft.freeQty, rate: draft.rate, discountPct: draft.discountPct, remark: draft.remark };
  const applyOrderDraft = (d: OrderDraft) => {
    setParty(d.party); setDate(d.date); setDeliveryDate(d.deliveryDate); setSource(d.source); setNarration(d.narration);
    setLines(d.lines.map((l) => ({ ...l, key: nextKey() }))); setReserve(d.reserve); setHoldUntil(d.holdUntil);
    setDirty(true);
    if (d.composer?.product) {
      // Bring back the item being typed, with fresh stock/rate.
      const c = d.composer;
      setDraft({ ...emptyDraft(), ...c, freeTouched: !!c.freeQty, loading: true });
      productInfo(c.product!._id, d.party?._id).then((info) => setDraft((x) => (x.product?._id === c.product!._id ? { ...x, info, loading: false } : x))).catch(() => setDraft((x) => ({ ...x, loading: false })));
    }
  };
  const autoDraft = useDraft<OrderDraft>({
    key: editable ? (id ? `sales_order:${id}` : 'sales_order:new') : null,
    ready: !id || (!loadingDoc && !!order),
    autoRestore: true,
    value: dirty || composer.product ? { party, date, deliveryDate, source, narration, lines, reserve, holdUntil, composer } : null,
    apply: applyOrderDraft,
    paused: !!saved,
    notBefore: order?.updatedAt ? Date.parse(order.updatedAt) : undefined,
  });
  const discardOrderDraft = () => { if (id) autoDraft.clear().then(() => window.location.reload()); else { autoDraft.clear(); resetForNew(); } };

  // ---- save ----
  const save = async () => {
    if (!editable || saving) return;
    if (!party) { enqueueSnackbar('Choose the customer', { variant: 'warning' }); return; }
    if (!lines.length) { enqueueSnackbar('Add at least one item', { variant: 'warning' }); productRef.current?.focus(); return; }
    const bad = lines.find((l) => !(n(l.qty) > 0));
    if (bad) { enqueueSnackbar(`${bad.productName}: quantity must be more than zero`, { variant: 'warning' }); return; }
    const body = {
      party: party._id, date, deliveryDate: deliveryDate || undefined, source, narration,
      reserve, reserveUntil: reserve ? holdUntil : undefined,
      items: lines.map((l) => ({
        ...(l._id ? { _id: l._id } : {}), product: l.product, qty: n(l.qty), freeQty: n(l.freeQty),
        ...(l.rate !== '' ? { rate: n(l.rate) } : {}), ...(l.discountPct !== '' ? { discountPct: n(l.discountPct) } : {}),
        remark: l.remark, fulfilledQty: l.fulfilledQty,
      })),
    };
    setSaving(true);
    try {
      const r = id ? await api.put(`/sales-orders/${id}`, body) : await api.post('/sales-orders', body);
      const o = r.data.data as Order;
      enqueueSnackbar(`Order ${o.number} ${id ? 'updated' : 'saved'}`, { variant: 'success' });
      setDirty(false);
      autoDraft.clear();
      setSaved(o);
      if (!id) nav(`/sales-orders/${o._id}`, { replace: true });
      else { setOrder(o); applyHeld(o); }
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('ctrl+s', () => { save(); }, [save]);

  // Refresh each line's own reservation (and free stock) after the server changed it.
  const applyHeld = (o: Order) => {
    setLines((ls) => ls.map((l) => { const it = o.items.find((i) => i._id === l._id); return it ? { ...l, held: itemReserved(it), reservations: it.reservations } : l; }));
    Promise.allSettled(o.items.map(async (i) => [i.product, await productInfo(i.product, o.party)] as const)).then((infos) => {
      const map = new Map(infos.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])));
      setLines((ls) => ls.map((l) => { const inf = map.get(l.product); return inf ? { ...l, stock: inf.stock } : l; }));
    });
  };

  const reservationAction = async (action: 'reserve' | 'release') => {
    if (!order || resBusy) return;
    setResBusy(true);
    try {
      const r = await api.post(`/sales-orders/${order._id}/${action}`, action === 'reserve' ? { until: holdUntil } : {});
      const o = r.data.data as Order;
      setOrder(o); setReserve(!!o.reserve); applyHeld(o);
      const s = reservationSummary(o);
      enqueueSnackbar(action === 'release' ? 'Stock released back to free stock.' : s.short ? `Holding ${num(s.held)} — still short ${num(s.short)}.` : `Holding all ${num(s.held)} until ${fdate(o.reserveUntil)}.`, { variant: action === 'release' || !s.short ? 'success' : 'warning' });
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setResBusy(false); }
  };

  const shareWhatsApp = (o: Order) => openWhatsApp(partyInfo?.data.mobile || partyInfo?.data.phone || party?.mobile, orderWhatsAppText(o, business, 'sales'));

  // ---- party alerts ----
  const pi = partyInfo;
  const alerts: { sev: 'error' | 'warning' | 'info'; text: string }[] = [];
  if (pi) {
    const d = pi.data;
    if (d.isHold) alerts.push({ sev: 'error', text: `Party is on HOLD${d.holdReason ? ` — ${d.holdReason}` : ''}. Bills will be blocked.` });
    if (d.dlExpiry && new Date(d.dlExpiry) < new Date()) alerts.push({ sev: 'error', text: `Drug licence expired on ${fdate(d.dlExpiry)}. Billing may be blocked until renewed.` });
    if (pi.summary.overdue > 0) alerts.push({ sev: 'warning', text: `₹${amt(pi.summary.overdue)} overdue — collect before delivery.` });
    if (d.creditLimit > 0 && pi.summary.outstanding + total > d.creditLimit) alerts.push({ sev: 'warning', text: `This order takes the party ₹${amt(pi.summary.outstanding + total - d.creditLimit)} over its credit limit of ₹${amt(d.creditLimit)}.` });
  }

  const title = id ? (order ? `Order ${order.number}` : 'Sales Order') : 'New Sales Order';

  if (loadingDoc) return <><PageHeader title="Sales Order" crumbs={[{ label: 'Sales Orders', to: '/sales-orders' }, { label: '…' }]} /><LinearProgress /></>;
  if (id && !order) return <><PageHeader title="Sales Order" crumbs={[{ label: 'Sales Orders', to: '/sales-orders' }]} /><Alert severity="error">Order not found.</Alert></>;

  return (
    <Box sx={{ pb: { xs: 10, sm: 2 } }}>
      <PageHeader
        help={['salesorder', 'reserved', 'scheme', 'ptr']}
        title={<>{title} {order && <StatusChip status={order.status} />}</>}
        subtitle={order ? `${fdate(order.date)}${order.salesmanName ? ` · ${order.salesmanName}` : ''}` : 'Book an order for a chemist — stock and party rate shown as you add items'}
        crumbs={[{ label: 'Sales Orders', to: '/sales-orders' }, { label: order?.number || 'New' }]}
        actions={
          <>
            {order && <Button startIcon={<WhatsAppIcon />} onClick={() => shareWhatsApp(order)}>WhatsApp</Button>}
            {order && (order.status === 'open' || order.status === 'partial') && can('sales:create') && (
              <Button variant="outlined" startIcon={<ReceiptLongOutlinedIcon />} disabled={dirty} onClick={() => nav(`/sales/new?order=${order._id}`)}>Make Bill</Button>
            )}
            <DraftStatus draft={autoDraft} />
            {editable && !isXs && <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />} onClick={save} disabled={saving}>Save (Ctrl+S)</Button>}
          </>
        }
      />

      <DraftBanner draft={autoDraft} label={(d) => { const x = d as OrderDraft; return `${x.party?.name || 'no customer yet'} · ${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`; }} onDiscard={discardOrderDraft} />

      {order && order.status !== 'open' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {order.status === 'partial' ? 'Part of this order is already billed, so it can no longer be edited.' : order.status === 'completed' ? 'This order is fully billed.' : 'This order was cancelled.'}
        </Alert>
      )}

      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={5}>
            <PartyPicker type="customer" value={party} onChange={changeParty} disabled={!!id || !editable} autoFocus={!id} required quickCreate />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField type="date" label="Order date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} disabled={!!id || !editable} fullWidth InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField type="date" label="Deliver by" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); setDirty(true); }} disabled={!editable} fullWidth InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TextField select label="Order via" value={source} onChange={(e) => { setSource(e.target.value); setDirty(true); }} disabled={!!id || !editable} fullWidth>
              {SOURCES.filter((s) => s.value !== 'portal' || source === 'portal').map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
          </Grid>
          {(editable || (order && reservationSummary(order).live)) && (
            <Grid item xs={12}>
              <ReservePanel
                order={order} editable={editable} reserve={reserve} holdUntil={holdUntil} busy={resBusy} canManage={can('sales_orders:edit')}
                onReserve={(v) => { setReserve(v); setDirty(true); }} onHoldUntil={(v) => { setHoldUntil(v); if (!order) setDirty(true); }}
                onAction={reservationAction}
              />
            </Grid>
          )}
        </Grid>
        {pi && (
          <Box sx={{ mt: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: alerts.length ? 1 : 0 }}>
              <Chip label={`Outstanding ₹${amt(pi.summary.outstanding)}`} color={pi.summary.outstanding > 0 ? 'default' : 'success'} variant="outlined" />
              {pi.data.creditLimit > 0 && <Chip label={`Limit ₹${amt(pi.data.creditLimit)}`} variant="outlined" />}
              {pi.data.creditDays > 0 && <Chip label={`${pi.data.creditDays} days credit`} variant="outlined" />}
              {pi.summary.lastBill && <Chip label={`Last bill ${fdate(pi.summary.lastBill.date)} · ₹${amt(pi.summary.lastBill.grandTotal)}`} variant="outlined" />}
              {(pi.data.mobile || pi.data.phone) && <Chip component="a" href={`tel:${pi.data.mobile || pi.data.phone}`} clickable label={`📞 ${pi.data.mobile || pi.data.phone}`} variant="outlined" />}
            </Stack>
            {alerts.map((a, i) => <Alert key={i} severity={a.sev} sx={{ mt: 0.5, py: 0 }}>{a.text}</Alert>)}
          </Box>
        )}
      </Paper>

      {/* Add item composer */}
      {editable && (
        <Paper sx={{ p: 2, mb: 2, borderColor: 'primary.light' }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} md={4}>
              <ProductPicker value={draft.product} onChange={pickProduct} inputRef={productRef} label="Add product" placeholder="Name, salt or code" />
            </Grid>
            <Grid item xs={4} sm={2} md={1.25}>
              <TextField label="Qty" type="number" value={draft.qty} inputRef={qtyRef} onChange={(e) => setDraftQty(e.target.value)} fullWidth
                inputProps={{ min: 0, inputMode: 'numeric' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
            </Grid>
            <Grid item xs={4} sm={2} md={1.25}>
              <TextField label="Free" type="number" value={draft.freeQty} onChange={(e) => setDraft((d) => ({ ...d, freeQty: e.target.value, freeTouched: true }))} fullWidth
                inputProps={{ min: 0, inputMode: 'numeric' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
            </Grid>
            <Grid item xs={4} sm={2} md={1.5}>
              <TextField label="Rate" type="number" value={draft.rate} onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))} fullWidth
                placeholder={draft.info?.partyRate != null ? amt(draft.info.partyRate) : draft.product ? amt(draft.product.ptr) : 'Party rate'}
                InputLabelProps={{ shrink: true }} inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
            </Grid>
            <Grid item xs={4} sm={2} md={1}>
              <TextField label="Disc %" type="number" value={draft.discountPct} onChange={(e) => setDraft((d) => ({ ...d, discountPct: e.target.value }))} fullWidth
                placeholder={draft.info?.partyDisc ? String(draft.info.partyDisc) : '0'} InputLabelProps={{ shrink: true }} inputProps={{ min: 0, max: 100, inputMode: 'decimal' }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
            </Grid>
            <Grid item xs={8} sm={4} md={2}>
              <TextField label="Remark" value={draft.remark} onChange={(e) => setDraft((d) => ({ ...d, remark: e.target.value }))} fullWidth
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
            </Grid>
            <Grid item xs={12} sm={12} md={1}>
              <Button variant="contained" fullWidth onClick={addDraft} startIcon={<AddIcon />} sx={{ height: { xs: 44, md: 36 } }}>Add</Button>
            </Grid>
          </Grid>
          {draft.product && (
            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {draft.loading && <CircularProgress size={14} />}
              <StockChip stock={draft.info?.stock ?? draft.product.stock} qty={n(draft.qty)} />
              {(draft.info?.nearestExpiry ?? draft.product.nearestExpiry) && <Chip variant="outlined" label={`Exp ${fexp(draft.info?.nearestExpiry ?? draft.product.nearestExpiry)}`} />}
              <Chip variant="outlined" label={`MRP ${amt(draft.product.mrp)} · PTR ${amt(draft.product.ptr)}`} />
              {draft.info?.partyRate != null && <Chip color="primary" variant="outlined" label={`Party rate ${amt(draft.info.partyRate)}${draft.info.partyDisc ? ` − ${draft.info.partyDisc}%` : ''}`} />}
              {(draft.info?.schemeBuy ?? draft.product.schemeBuy) ? <Chip color="secondary" variant="outlined" label={`Scheme ${draft.info?.schemeBuy ?? draft.product.schemeBuy}+${draft.info?.schemeFree ?? draft.product.schemeFree}`} /> : null}
              <Typography variant="caption" color="text.secondary">GST {draft.info?.gstRate ?? draft.product.gstRate}% · leave Rate blank to use the party's rate</Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Lines */}
      {isXs ? (
        <Stack spacing={1.25}>
          {lines.map((l, i) => <LineCard key={l.key} l={l} i={i} editable={editable} onChange={(p) => updateLine(l.key, p)} onRemove={() => removeLine(l.key)} />)}
        </Stack>
      ) : (
        <Paper sx={{ overflow: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={32}>#</TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="right">Stock</TableCell>
                <TableCell align="right" width={90}>Qty</TableCell>
                <TableCell align="right" width={80}>Free</TableCell>
                <TableCell align="right" width={100}>Rate</TableCell>
                <TableCell align="right" width={80}>Disc %</TableCell>
                <TableCell width={160}>Remark</TableCell>
                {order && <TableCell align="right">Reserved</TableCell>}
                {order && order.status !== 'open' && <TableCell align="right">Billed</TableCell>}
                <TableCell align="right">Amount</TableCell>
                {editable && <TableCell width={40} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={l.key} hover>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={600}>{l.productName}</Typography>
                    <Typography fontSize={11} color="text.secondary">{[l.manufacturerName, l.packing, l.gstRate !== undefined ? `GST ${l.gstRate}%` : ''].filter(Boolean).join(' · ')}</Typography>
                  </TableCell>
                  <TableCell align="right"><StockChip stock={l.stock === undefined ? undefined : l.stock + (l.held || 0)} qty={n(l.qty) - l.fulfilledQty} /></TableCell>
                  <TableCell align="right">{editable ? <NumIn value={l.qty} onChange={(v) => updateLine(l.key, { qty: v })} /> : num(n(l.qty))}</TableCell>
                  <TableCell align="right">{editable ? <NumIn value={l.freeQty} onChange={(v) => updateLine(l.key, { freeQty: v })} /> : (n(l.freeQty) || '')}</TableCell>
                  <TableCell align="right">{editable ? <NumIn value={l.rate} placeholder={l.partyRate != null ? amt(l.partyRate) : l.ptr != null ? amt(l.ptr) : ''} onChange={(v) => updateLine(l.key, { rate: v })} /> : amt(effRate(l))}</TableCell>
                  <TableCell align="right">{editable ? <NumIn value={l.discountPct} placeholder={l.partyDisc ? String(l.partyDisc) : ''} onChange={(v) => updateLine(l.key, { discountPct: v })} /> : (effDisc(l) || '')}</TableCell>
                  <TableCell>{editable ? <TextField variant="standard" value={l.remark} onChange={(e) => updateLine(l.key, { remark: e.target.value })} fullWidth /> : l.remark}</TableCell>
                  {order && <TableCell align="right"><HeldCell l={l} item={order.items.find((i) => i._id === l._id)} /></TableCell>}
                  {order && order.status !== 'open' && <TableCell align="right">{l.fulfilledQty} / {n(l.qty)}</TableCell>}
                  <TableCell align="right"><b>{amt(lineAmount(l))}</b></TableCell>
                  {editable && <TableCell><IconButton color="error" onClick={() => removeLine(l.key)}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>}
                </TableRow>
              ))}
              {!lines.length && (
                <TableRow><TableCell colSpan={11}><Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary">No items yet — search a product above, type the qty and press Enter.</Typography></Box></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
      {isXs && !lines.length && editable && <Typography color="text.secondary" textAlign="center" sx={{ py: 3 }}>No items yet — search a product above and tap Add.</Typography>}

      {/* Footer: narration + totals */}
      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={7}>
          <TextField label="Narration / instructions" value={narration} onChange={(e) => { setNarration(e.target.value); setDirty(true); }} disabled={!editable} fullWidth multiline minRows={2} />
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Row label="Items" value={String(lines.length)} />
            <Row label="Total qty" value={num(totalQty)} />
            <Divider sx={{ my: 1 }} />
            <Row label="Estimated total (incl. GST)" value={`₹${amt(total)}`} big />
            <Typography variant="caption" color="text.secondary">Approximate — final bill depends on batch, scheme and stock at billing.</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Phone: sticky save bar */}
      {editable && isXs && (
        <Paper sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 10, borderRadius: 0, boxShadow: '0 -2px 10px rgba(0,0,0,.08)' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">{lines.length} items · est.</Typography>
            <Typography fontWeight={700} fontSize={18}>₹{amt(total)}</Typography>
          </Box>
          <Button variant="contained" size="large" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />} sx={{ px: 4, py: 1.25 }}>Save</Button>
        </Paper>
      )}

      <Dialog open={!!saved} onClose={() => setSaved(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Order {saved?.number} saved</DialogTitle>
        <DialogContent>
          <Typography>{saved?.partyName}</Typography>
          <Typography color="text.secondary">{saved?.items.length} items · est. ₹{amt(saved?.estimatedTotal)}</Typography>
          {saved?.reserve && (() => {
            const s = reservationSummary(saved);
            return <Alert severity={s.short ? 'warning' : 'success'} sx={{ mt: 1.5 }}>
              {s.held ? `${num(s.held)} units held for this party until ${fdate(saved.reserveUntil)}.` : 'Nothing could be held — no free stock.'}
              {s.short ? ` Short ${num(s.short)} — use "Reserve available stock" on the order after the purchase arrives.` : ''}
            </Alert>;
          })()}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
          <Button fullWidth={isXs} variant="outlined" color="success" startIcon={<WhatsAppIcon />} onClick={() => saved && shareWhatsApp(saved)}>Send to party</Button>
          {saved && can('sales:create') && <Button fullWidth={isXs} variant="outlined" startIcon={<ReceiptLongOutlinedIcon />} onClick={() => nav(`/sales/new?order=${saved._id}`)}>Make Bill</Button>}
          <Button fullWidth={isXs} onClick={() => { setSaved(null); nav('/sales-orders'); }}>Orders list</Button>
          {can('sales_orders:create') && <Button fullWidth={isXs} variant="contained" onClick={() => { setSaved(null); nav('/sales-orders/new'); resetForNew(); }}>New order</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );

  function resetForNew() {
    setOrder(null); setParty(null); setPartyInfo(null); setLines([]); setNarration(''); setDeliveryDate(''); setDate(today()); setDraft(emptyDraft()); setDirty(false);
  }
}

const Row: React.FC<{ label: string; value: string; big?: boolean }> = ({ label, value, big }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography fontSize={big ? 14 : 13} fontWeight={big ? 700 : 400} color={big ? 'text.primary' : 'text.secondary'}>{label}</Typography>
    <Typography fontSize={big ? 18 : 13} fontWeight={700}>{value}</Typography>
  </Box>
);

const StockChip: React.FC<{ stock?: number; qty: number }> = ({ stock, qty }) => {
  if (stock === undefined) return <Typography fontSize={12} color="text.secondary">—</Typography>;
  const short = qty > stock;
  return <Chip label={stock <= 0 ? 'No free stock' : short ? `Free ${num(stock)} (short ${num(qty - stock)})` : `Free ${num(stock)}`} color={stock <= 0 ? 'error' : short ? 'warning' : 'success'} variant="outlined" sx={{ height: 20, fontSize: 11 }} />;
};

const NumIn: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <TextField variant="standard" type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }} sx={{ width: '100%' }} onFocus={(e) => e.target.select()} />
);

// Phone layout for one line: big +/- buttons, no horizontal scroll.
const LineCard: React.FC<{ l: Line; i: number; editable: boolean; onChange: (p: Partial<Line>) => void; onRemove: () => void }> = ({ l, i, editable, onChange, onRemove }) => (
  <Card variant="outlined" sx={{ p: 1.5 }}>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={700} fontSize={14}>{i + 1}. {l.productName}</Typography>
        <Typography fontSize={12} color="text.secondary">{[l.manufacturerName, l.packing].filter(Boolean).join(' · ')}</Typography>
        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <StockChip stock={l.stock === undefined ? undefined : l.stock + (l.held || 0)} qty={n(l.qty) - l.fulfilledQty} />
          {!!l.held && <Chip label={`Held ${num(l.held)}`} color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
        </Box>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography fontWeight={700}>₹{amt(lineAmount(l))}</Typography>
        {editable && <IconButton color="error" onClick={onRemove} sx={{ mt: 0.5 }} size="medium"><DeleteOutlineIcon /></IconButton>}
      </Box>
    </Box>
    {editable ? (
      <Grid container spacing={1} sx={{ mt: 0.5 }} alignItems="center">
        <Grid item xs={7}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="large" sx={{ border: 1, borderColor: 'divider' }} onClick={() => onChange({ qty: String(Math.max(1, n(l.qty) - 1)) })}><RemoveIcon /></IconButton>
            <TextField value={l.qty} type="number" onChange={(e) => onChange({ qty: e.target.value })} inputProps={{ inputMode: 'numeric', style: { textAlign: 'center', fontSize: 18, fontWeight: 700 } }} sx={{ width: 72 }} label="Qty" />
            <IconButton size="large" sx={{ border: 1, borderColor: 'divider' }} onClick={() => onChange({ qty: String(n(l.qty) + 1) })}><AddIcon /></IconButton>
          </Box>
        </Grid>
        <Grid item xs={5}><TextField label="Free" type="number" value={l.freeQty} onChange={(e) => onChange({ freeQty: e.target.value })} fullWidth inputProps={{ inputMode: 'numeric' }} /></Grid>
        <Grid item xs={6}>
          <TextField label="Rate" type="number" value={l.rate} onChange={(e) => onChange({ rate: e.target.value })} fullWidth InputLabelProps={{ shrink: true }}
            placeholder={l.partyRate != null ? amt(l.partyRate) : l.ptr != null ? amt(l.ptr) : 'Party rate'} inputProps={{ inputMode: 'decimal' }}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
        </Grid>
        <Grid item xs={6}><TextField label="Disc %" type="number" value={l.discountPct} onChange={(e) => onChange({ discountPct: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} placeholder={l.partyDisc ? String(l.partyDisc) : '0'} inputProps={{ inputMode: 'decimal' }} /></Grid>
        <Grid item xs={12}><TextField label="Remark" value={l.remark} onChange={(e) => onChange({ remark: e.target.value })} fullWidth /></Grid>
      </Grid>
    ) : (
      <Typography fontSize={13} sx={{ mt: 0.5 }}>
        Qty <b>{l.qty}</b>{n(l.freeQty) ? ` + ${l.freeQty} free` : ''} · ₹{amt(effRate(l))}{effDisc(l) ? ` − ${effDisc(l)}%` : ''}{l.fulfilledQty ? ` · billed ${l.fulfilledQty}` : ''}{l.remark ? ` · ${l.remark}` : ''}
      </Typography>
    )}
  </Card>
);

// "Hold stock for this party" — set before saving; once saved shows what is
// held, the shortfall and reserve/extend/release actions.
const ReservePanel: React.FC<{
  order: Order | null; editable: boolean; reserve: boolean; holdUntil: string; busy: boolean; canManage: boolean;
  onReserve: (v: boolean) => void; onHoldUntil: (v: string) => void; onAction: (a: 'reserve' | 'release') => void;
}> = ({ order, editable, reserve, holdUntil, busy, canManage, onReserve, onHoldUntil, onAction }) => {
  const s = order ? reservationSummary(order) : null;
  const expired = !!order?.reserveUntil && new Date(order.reserveUntil) < new Date();
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', p: 1.25, borderRadius: 1, border: 1, borderColor: s?.active ? 'primary.light' : 'divider', bgcolor: s?.active ? 'rgba(15,92,140,0.05)' : undefined }}>
      <FormControlLabel sx={{ mr: 0 }} disabled={!editable || !!order}
        control={<Switch checked={order ? !!order.reserve : reserve} onChange={(e) => onReserve(e.target.checked)} />}
        label={<Typography fontSize={13} fontWeight={600}>Hold stock for this party</Typography>} />
      <TextField type="date" size="small" label="Hold until" value={holdUntil} onChange={(e) => onHoldUntil(e.target.value)} disabled={!(order ? canManage : editable && reserve)}
        InputLabelProps={{ shrink: true }} inputProps={{ min: dayjs().format('YYYY-MM-DD') }} sx={{ width: 160 }} />
      {s && (s.active
        ? <Typography fontSize={13}><b>{num(s.held)}</b> held{s.short ? <> · <Typography component="span" fontSize={13} color="warning.dark" fontWeight={700}>short {num(s.short)}</Typography></> : ' · fully covered'} · till {fdate(order!.reserveUntil)}</Typography>
        : <Typography fontSize={13} color="text.secondary">{expired ? 'Hold period ended — stock was released.' : 'Not holding any stock.'}{s.need ? ` Needs ${num(s.need)}.` : ''}</Typography>)}
      {!order && <Typography fontSize={12} color="text.secondary">{reserve ? 'Earliest-expiry stock is set aside on save; other bills can’t take it.' : 'Stock stays free for any bill until this order is billed.'}</Typography>}
      {order && s?.live && canManage && (
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => onAction('reserve')}>{s.active ? (s.short ? 'Reserve available stock' : 'Update hold date') : 'Reserve stock'}</Button>
          {s.held > 0 && <Button size="small" color="warning" disabled={busy} onClick={() => onAction('release')}>Release</Button>}
        </Box>
      )}
    </Box>
  );
};

const HeldCell: React.FC<{ l: Line; item?: Order['items'][number] }> = ({ l, item }) => {
  if (!item) return <Typography fontSize={12} color="text.secondary">—</Typography>;
  const target = itemReserveTarget(item);
  const held = l.held || 0;
  if (!target) return <Typography fontSize={12} color="text.secondary">—</Typography>;
  return (
    <Tooltip title={l.reservations?.length ? l.reservations.map((r) => `${r.batchNo} · Exp ${fexp(r.expiry)} · ${r.qty}`).join('\n') : 'Nothing held'}
      slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }}>
      <Chip label={`${num(held)} / ${num(target)}`} color={held >= target ? 'success' : held ? 'warning' : 'default'} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
    </Tooltip>
  );
};
