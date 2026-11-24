import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Grid,
  IconButton, LinearProgress, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { ManufacturerPicker, PartyOption, PartyPicker, ProductOption, ProductPicker } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useHotkey } from '../../lib/hooks';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { amt, fdate, isoDate, num, round2, today } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Batch, Product } from '../../lib/types';
import { Order } from '../sales/orderUtils';
import { printPO, whatsAppPO } from './poShare';
import BatchStrip from '../sales/BatchStrip';

interface Line {
  key: string; _id?: string; product: string; productName: string; manufacturerName: string; packing: string;
  gstRate?: number; stock?: number; monthlySales?: number; pendingOrders?: number;
  qty: string; freeQty: string; rate: string; discountPct: string; remark: string; fulfilledQty: number;
}

interface Suggestion {
  product: string; productName: string; manufacturerName: string; packing: string; stock: number; pendingOrders: number; monthlySales: number;
  reorderLevel: number; suggestQty: number; rate: number; gstRate: number; supplier: string | null; supplierName: string;
}

let seq = 0;
const nk = () => `p${++seq}`;
const n = (s: string | number | undefined) => Number(s) || 0;
const emptyComposer = () => ({ product: null as ProductOption | null, qty: '', freeQty: '', rate: '', discountPct: '', gstRate: 0, stock: 0, batches: null as Batch[] | null });
const lineAmount = (l: Line) => round2(n(l.qty) * n(l.rate) * (1 - n(l.discountPct) / 100) * (1 + (l.gstRate ?? 0) / 100));

const productInfo = async (id: string) => {
  const r = await api.get(`/products/${id}/batches`, { params: { all: 'true' } });
  const p = r.data.product as Product;
  const all = r.data.data as Batch[];
  // Batches in stock; if none, the last few bought — so the buyer still sees past prices.
  const recent = [...all].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const inStock = all.filter((b) => b.qty > 0 || b.damagedQty > 0);
  const batches = inStock.length ? inStock : recent.slice(0, 3);
  const lastRate = recent.find((b) => b.purchaseRate > 0)?.purchaseRate;
  return { gstRate: p.gstRate, purchaseRate: lastRate || p.purchaseRate, stock: all.reduce((s, b) => s + b.qty, 0), packing: p.packing, manufacturerName: p.manufacturerName, batches };
};

export default function PurchaseOrderEntry() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [order, setOrder] = useState<Order | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(!!id);
  const [supplier, setSupplier] = useState<PartyOption | null>(null);
  const [date, setDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState(emptyComposer());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Order | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reload, setReload] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const productRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const [sp] = useSearchParams();
  // ?product prefill finished (auto-save waits for it).
  const [prefilled, setPrefilled] = useState(!sp.get('product'));

  // Opened from a product page (?product=ID): load that product into the
  // composer, with its last supplier and reorder qty.
  useEffect(() => {
    const pid = sp.get('product');
    if (id || !pid) return;
    (async () => {
      try {
        const r = await api.get(`/products/${pid}/batches`, { params: { all: 'true' } });
        const p = r.data.product as Product;
        const batches = r.data.data as Batch[];
        const opt: ProductOption = {
          _id: p._id, name: p.name, manufacturerName: p.manufacturerName, packing: p.packing, salt: p.salt, gstRate: p.gstRate, mrp: p.mrp, ptr: p.ptr,
          schedule: p.schedule, rack: p.rack, isBanned: p.isBanned, stock: batches.reduce((s, b) => s + b.qty, 0), nearestExpiry: null,
        };
        await pickProduct(opt);
        if (p.reorderQty) setDraft((d) => ({ ...d, qty: d.qty || String(p.reorderQty) }));
        const last = [...batches].filter((b) => b.supplier).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (last?.supplier) {
          const s = (await api.get(`/parties/${last.supplier}`)).data.data;
          setSupplier((cur) => cur || { _id: s._id, name: s.name, city: s.city, gstin: s.gstin, mobile: s.mobile });
        }
      } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
      setPrefilled(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const editable = id ? !!order && order.status === 'open' && can('purchase_orders:edit') : can('purchase_orders:create');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoadingDoc(true);
    api.get(`/purchase-orders/${id}`).then(async (r) => {
      const o = r.data.data as Order;
      if (!alive) return;
      setOrder(o);
      setSupplier({ _id: o.party, name: o.partyName });
      setDate(isoDate(o.date));
      setExpectedDate(isoDate(o.expectedDate));
      setNarration(o.narration || '');
      const base: Line[] = o.items.map((i) => ({
        key: nk(), _id: i._id, product: i.product, productName: i.productName, manufacturerName: i.manufacturerName, packing: i.packing,
        qty: String(i.qty), freeQty: i.freeQty ? String(i.freeQty) : '', rate: String(i.rate || ''), discountPct: i.discountPct ? String(i.discountPct) : '',
        remark: i.remark || '', fulfilledQty: i.fulfilledQty || 0,
      }));
      setLines(base);
      setLoadingDoc(false);
      const infos = await Promise.allSettled([...new Set(base.map((l) => l.product))].map(async (pid) => [pid, await productInfo(pid)] as const));
      if (!alive) return;
      const map = new Map(infos.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])));
      setLines((ls) => ls.map((l) => { const inf = map.get(l.product); return inf ? { ...l, gstRate: inf.gstRate, stock: inf.stock } : l; }));
    }).catch((e) => { enqueueSnackbar(errMsg(e), { variant: 'error' }); setLoadingDoc(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reload]);

  const pickProduct = async (p: ProductOption | null) => {
    setDraft({ product: p, qty: '', freeQty: '', rate: '', discountPct: '', gstRate: p?.gstRate || 0, stock: p?.stock || 0, batches: null });
    if (!p) return;
    setTimeout(() => qtyRef.current?.focus(), 30);
    try {
      const inf = await productInfo(p._id);
      setDraft((d) => (d.product?._id === p._id ? { ...d, rate: d.rate || String(inf.purchaseRate || ''), gstRate: inf.gstRate, stock: inf.stock, batches: inf.batches } : d));
    } catch { /* keep defaults */ }
  };

  const addDraft = () => {
    const p = draft.product;
    if (!p) { productRef.current?.focus(); return; }
    if (!(n(draft.qty) > 0)) { enqueueSnackbar('Enter quantity', { variant: 'warning' }); qtyRef.current?.focus(); return; }
    const ex = lines.find((l) => l.product === p._id);
    if (ex) {
      setLines((ls) => ls.map((l) => (l.key === ex.key ? { ...l, qty: String(n(l.qty) + n(draft.qty)) } : l)));
      enqueueSnackbar(`${p.name} already on the PO — quantity added`, { variant: 'info' });
    } else {
      setLines((ls) => [...ls, {
        key: nk(), product: p._id, productName: p.name, manufacturerName: p.manufacturerName, packing: p.packing, gstRate: draft.gstRate, stock: draft.stock,
        qty: draft.qty, freeQty: draft.freeQty, rate: draft.rate, discountPct: draft.discountPct, remark: '', fulfilledQty: 0,
      }]);
    }
    setDirty(true);
    setDraft({ product: null, qty: '', freeQty: '', rate: '', discountPct: '', gstRate: 0, stock: 0, batches: null });
    setTimeout(() => productRef.current?.focus(), 30);
  };

  const addSuggestions = (rows: (Suggestion & { take: number })[]) => {
    setLines((ls) => {
      const out = [...ls];
      for (const s of rows) {
        const ex = out.findIndex((l) => l.product === String(s.product));
        const base = { stock: s.stock, monthlySales: s.monthlySales, pendingOrders: s.pendingOrders, gstRate: s.gstRate };
        if (ex >= 0) out[ex] = { ...out[ex], ...base, qty: String(Math.max(n(out[ex].qty), s.take)) };
        else out.push({ key: nk(), product: String(s.product), productName: s.productName, manufacturerName: s.manufacturerName, packing: s.packing, ...base, qty: String(s.take), freeQty: '', rate: s.rate ? String(s.rate) : '', discountPct: '', remark: '', fulfilledQty: 0 });
      }
      return out;
    });
    setDirty(true);
    enqueueSnackbar(`${rows.length} item(s) added from reorder suggestions`, { variant: 'success' });
    setSuggestOpen(false);
  };

  const upd = (key: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setDirty(true); };
  const total = useMemo(() => round2(lines.reduce((s, l) => s + lineAmount(l), 0)), [lines]);
  const showVelocity = lines.some((l) => l.monthlySales !== undefined);

  // ---- auto-save (unsaved PO survives leaving the screen / power cut) ----
  type PODraft = {
    supplier: PartyOption | null; date: string; expectedDate: string; narration: string; lines: Line[];
    composer: { product: ProductOption | null; qty: string; freeQty: string; rate: string; discountPct: string };
  };
  const composer = { product: draft.product, qty: draft.qty, freeQty: draft.freeQty, rate: draft.rate, discountPct: draft.discountPct };
  const applyPODraft = (d: PODraft) => {
    setSupplier(d.supplier); setDate(d.date); setExpectedDate(d.expectedDate); setNarration(d.narration);
    setLines(d.lines.map((l) => ({ ...l, key: nk() })));
    setDirty(true);
    const c = d.composer;
    if (c?.product) {
      // Bring back the item being typed, with fresh stock/batches.
      setDraft({ ...emptyComposer(), ...c, gstRate: c.product.gstRate || 0, stock: c.product.stock || 0 });
      productInfo(c.product._id).then((inf) => setDraft((x) => (x.product?._id === c.product!._id ? { ...x, gstRate: inf.gstRate, stock: inf.stock, batches: inf.batches } : x))).catch(() => {});
    } else setDraft(emptyComposer());
  };
  const autoDraft = useDraft<PODraft>({
    key: editable ? (id ? `purchase_order:${id}` : 'purchase_order:new') : null,
    ready: id ? !loadingDoc && !!order : prefilled,
    autoRestore: !!id || !sp.get('product'),
    value: dirty || composer.product ? { supplier, date, expectedDate, narration, lines, composer } : null,
    apply: applyPODraft,
    paused: !!saved,
    notBefore: id && order?.updatedAt ? Date.parse(order.updatedAt) : undefined,
  });
  const discardPODraft = () => {
    autoDraft.clear(); setDirty(false); setDraft(emptyComposer());
    if (id) setReload((x) => x + 1);
    else { setSupplier(null); setDate(today()); setExpectedDate(''); setNarration(''); setLines([]); }
  };

  const save = async () => {
    if (!editable || saving) return;
    if (!supplier) { enqueueSnackbar('Choose the supplier', { variant: 'warning' }); return; }
    if (!lines.length) { enqueueSnackbar('Add at least one item', { variant: 'warning' }); return; }
    const bad = lines.find((l) => !(n(l.qty) > 0));
    if (bad) { enqueueSnackbar(`${bad.productName}: quantity must be more than zero`, { variant: 'warning' }); return; }
    const body = {
      party: supplier._id, date, expectedDate: expectedDate || undefined, narration,
      items: lines.map((l) => ({
        ...(l._id ? { _id: l._id } : {}), product: l.product, qty: n(l.qty), freeQty: n(l.freeQty),
        ...(l.rate !== '' ? { rate: n(l.rate) } : {}), discountPct: n(l.discountPct), remark: l.remark, fulfilledQty: l.fulfilledQty,
      })),
    };
    setSaving(true);
    try {
      const r = id ? await api.put(`/purchase-orders/${id}`, body) : await api.post('/purchase-orders', body);
      const o = r.data.data as Order;
      enqueueSnackbar(`PO ${o.number} ${id ? 'updated' : 'saved'}`, { variant: 'success' });
      setDirty(false);
      autoDraft.clear();
      setSaved(o);
      if (!id) nav(`/purchase-orders/${o._id}`, { replace: true }); else setOrder(o);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setSaving(false); }
  };
  useHotkey('ctrl+s', () => { save(); }, [save]);

  if (loadingDoc) return <><PageHeader title="Purchase Order" crumbs={[{ label: 'Purchase Orders', to: '/purchase-orders' }, { label: '…' }]} /><LinearProgress /></>;
  if (id && !order) return <><PageHeader title="Purchase Order" crumbs={[{ label: 'Purchase Orders', to: '/purchase-orders' }]} /><Alert severity="error">Purchase order not found.</Alert></>;

  const pendingPO = order && (order.status === 'open' || order.status === 'partial');

  return (
    <>
      <PageHeader
        help={['purchaseorder', 'pts', 'landing', 'reorder']}
        title={<>{order ? `PO ${order.number}` : 'New Purchase Order'} {order && <StatusChip status={order.status} />}</>}
        subtitle={order ? `${order.partyName} · ${fdate(order.date)}` : 'Order stock from a supplier — load reorder suggestions to fill it fast'}
        crumbs={[{ label: 'Purchase Orders', to: '/purchase-orders' }, { label: order?.number || 'New' }]}
        actions={
          <>
            <DraftStatus draft={autoDraft} />
            {order && business && <Button startIcon={<PrintOutlinedIcon />} onClick={() => printPO(order, business)}>Print</Button>}
            {order && <Button startIcon={<WhatsAppIcon />} onClick={() => whatsAppPO(order, business)}>WhatsApp</Button>}
            {pendingPO && can('purchases:create') && <Button variant="outlined" startIcon={<MoveToInboxOutlinedIcon />} onClick={() => nav(`/purchases/new?po=${order!._id}`)}>Receive</Button>}
            {editable && <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />} onClick={save} disabled={saving}>Save (Ctrl+S)</Button>}
          </>
        }
      />
      <DraftBanner draft={autoDraft} label={(d) => { const x = d as PODraft; return `${x.supplier?.name || 'no supplier yet'} · ${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`; }}
        onDiscard={discardPODraft} onOpen={() => { if (sp.toString()) nav('/purchase-orders/new', { replace: true }); }} />
      {order && order.status !== 'open' && (
        <Alert severity="info" sx={{ mb: 2 }}>{order.status === 'partial' ? 'Goods have been partly received against this PO, so it can no longer be edited.' : order.status === 'completed' ? 'Fully received.' : 'This PO was cancelled.'}</Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={5}><PartyPicker type="supplier" value={supplier} onChange={(v) => { setSupplier(v); setDirty(true); }} disabled={!!id || !editable} autoFocus={!id} required quickCreate /></Grid>
          <Grid item xs={6} md={2}><TextField type="date" label="PO date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} disabled={!!id || !editable} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={6} md={2}>
            <TextField type="date" label="Expected by" value={expectedDate} onChange={(e) => { setExpectedDate(e.target.value); setDirty(true); }} disabled={!!id || !editable} fullWidth InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} md={3}>
            {editable && <Button fullWidth variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => setSuggestOpen(true)}>Load reorder suggestions</Button>}
          </Grid>
        </Grid>
      </Paper>

      {editable && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} md={4}><ProductPicker value={draft.product} onChange={pickProduct} inputRef={productRef} label="Add product" quickCreate /></Grid>
            {([['qty', 'Qty'], ['freeQty', 'Free'], ['rate', 'Rate'], ['discountPct', 'Disc %']] as const).map(([k, label]) => (
              <Grid item xs={6} sm={3} md={1.5} key={k}>
                <TextField label={label} type="number" fullWidth value={draft[k]} inputRef={k === 'qty' ? qtyRef : undefined} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  inputProps={{ min: 0, step: 'any' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
              </Grid>
            ))}
            <Grid item xs={12} md={2}><Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={addDraft}>Add</Button></Grid>
          </Grid>
          {draft.product && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Stock {num(draft.stock)} · GST {draft.gstRate}% · PTR {amt(draft.product.ptr)} · MRP {amt(draft.product.mrp)} — rate prefilled with last purchase rate</Typography>}
          {draft.product && draft.batches && draft.batches.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography fontSize={11} color="text.secondary" sx={{ mb: 0.5 }}>Current stock by batch — order for the sellable qty, short-expiry stock won't go out on bills.</Typography>
              <BatchStrip batches={draft.batches} leftOf={(b) => b.qty} showRate={false} showPurchase maxHeight={150} />
            </Box>
          )}
        </Paper>
      )}

      <Paper sx={{ overflow: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell align="right">Stock</TableCell>
              {showVelocity && <TableCell align="right">Sales/mo</TableCell>}
              {showVelocity && <TableCell align="right">On SO</TableCell>}
              <TableCell align="right" width={85}>Qty</TableCell><TableCell align="right" width={75}>Free</TableCell>
              <TableCell align="right" width={95}>Rate</TableCell><TableCell align="right" width={70}>Disc %</TableCell>
              {order && order.status !== 'open' && <TableCell align="right">Received</TableCell>}
              <TableCell align="right">Amount</TableCell>{editable && <TableCell width={40} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={l.key} hover>
                <TableCell>{i + 1}</TableCell>
                <TableCell><Typography fontSize={13} fontWeight={600}>{l.productName}</Typography><Typography fontSize={11} color="text.secondary">{[l.manufacturerName, l.packing, l.gstRate !== undefined ? `GST ${l.gstRate}%` : ''].filter(Boolean).join(' · ')}</Typography></TableCell>
                <TableCell align="right">{l.stock !== undefined ? num(l.stock) : '—'}</TableCell>
                {showVelocity && <TableCell align="right">{l.monthlySales !== undefined ? num(l.monthlySales) : ''}</TableCell>}
                {showVelocity && <TableCell align="right">{l.pendingOrders || ''}</TableCell>}
                <TableCell align="right">{editable ? <Cell value={l.qty} onChange={(v) => upd(l.key, { qty: v })} /> : l.qty}</TableCell>
                <TableCell align="right">{editable ? <Cell value={l.freeQty} onChange={(v) => upd(l.key, { freeQty: v })} /> : l.freeQty}</TableCell>
                <TableCell align="right">{editable ? <Cell value={l.rate} placeholder="last rate" onChange={(v) => upd(l.key, { rate: v })} /> : amt(n(l.rate))}</TableCell>
                <TableCell align="right">{editable ? <Cell value={l.discountPct} onChange={(v) => upd(l.key, { discountPct: v })} /> : l.discountPct}</TableCell>
                {order && order.status !== 'open' && <TableCell align="right">{l.fulfilledQty} / {l.qty}</TableCell>}
                <TableCell align="right"><b>{amt(lineAmount(l))}</b></TableCell>
                {editable && <TableCell><IconButton color="error" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true); }}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>}
              </TableRow>
            ))}
            {!lines.length && <TableRow><TableCell colSpan={12}><Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary">No items yet — add products or load reorder suggestions.</Typography></Box></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={7}><TextField label="Narration / instructions to supplier" value={narration} onChange={(e) => { setNarration(e.target.value); setDirty(true); }} disabled={!editable} fullWidth multiline minRows={2} /></Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Items / qty</Typography><Typography fontWeight={600}>{lines.length} / {num(lines.reduce((s, l) => s + n(l.qty), 0))}</Typography></Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography fontWeight={700}>Estimated value (incl. GST)</Typography><Typography fontWeight={700} fontSize={18}>₹{amt(total)}</Typography></Box>
          </Paper>
        </Grid>
      </Grid>

      {editable && <SuggestDialog open={suggestOpen} supplier={supplier} onClose={() => setSuggestOpen(false)} onAdd={addSuggestions} />}

      <Dialog open={!!saved} onClose={() => setSaved(null)} maxWidth="xs" fullWidth>
        <DialogTitle>PO {saved?.number} saved</DialogTitle>
        <DialogContent><Typography>{saved?.partyName}</Typography><Typography color="text.secondary">{saved?.items.length} items · est. ₹{amt(saved?.estimatedTotal)}</Typography></DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          {saved && business && <Button startIcon={<PrintOutlinedIcon />} onClick={() => printPO(saved, business)}>Print</Button>}
          {saved && <Button color="success" startIcon={<WhatsAppIcon />} onClick={() => whatsAppPO(saved, business)}>WhatsApp</Button>}
          <Button onClick={() => { setSaved(null); nav('/purchase-orders'); }}>PO list</Button>
          <Button variant="contained" onClick={() => setSaved(null)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const Cell: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <TextField variant="standard" type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }} onFocus={(e) => e.target.select()} sx={{ width: '100%' }} />
);

function SuggestDialog({ open, supplier, onClose, onAdd }: { open: boolean; supplier: PartyOption | null; onClose: () => void; onAdd: (rows: (Suggestion & { take: number })[]) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const [onlySupplier, setOnlySupplier] = useState(true);
  const [rows, setRows] = useState<(Suggestion & { take: string; sel: boolean })[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    api.get('/purchase-orders/suggest', { params: { supplier: onlySupplier && supplier ? supplier._id : undefined, manufacturer: company?._id } })
      .then((r) => { if (alive) setRows((r.data.data as Suggestion[]).map((s) => ({ ...s, take: String(s.suggestQty), sel: true }))); })
      .catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlySupplier, company?._id, supplier?._id]);

  const set = (i: number, patch: Partial<Suggestion & { take: string; sel: boolean }>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sel = rows.filter((r) => r.sel && n(r.take) > 0);
  const all = rows.length > 0 && rows.every((r) => r.sel);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Reorder suggestions<Typography variant="body2" color="text.secondary">Items at or below reorder level, or short against pending sales orders — with 90-day sales velocity.</Typography></DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
          <ManufacturerPicker value={company} onChange={setCompany} sx={{ width: 280 }} />
          <FormControlLabel disabled={!supplier} control={<Switch checked={onlySupplier && !!supplier} onChange={(e) => setOnlySupplier(e.target.checked)} />}
            label={supplier ? `Only items last bought from ${supplier.name}` : 'Choose a supplier to filter by last supplier'} />
        </Box>
        {loading && <LinearProgress />}
        <Paper variant="outlined" sx={{ maxHeight: '55vh', overflow: 'auto' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={all} indeterminate={!all && rows.some((r) => r.sel)} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, sel: e.target.checked })))} /></TableCell>
                <TableCell>Product</TableCell><TableCell align="right">Stock</TableCell><TableCell align="right">On SO</TableCell>
                <TableCell align="right">Sales/mo</TableCell><TableCell align="right">Reorder lvl</TableCell><TableCell>Last supplier</TableCell>
                <TableCell align="right">Last rate</TableCell><TableCell align="right" width={90}>Order qty</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={String(r.product)} hover selected={r.sel}>
                  <TableCell padding="checkbox"><Checkbox checked={r.sel} onChange={(e) => set(i, { sel: e.target.checked })} /></TableCell>
                  <TableCell><Typography fontSize={13} fontWeight={600}>{r.productName}</Typography><Typography fontSize={11} color="text.secondary">{r.manufacturerName} · {r.packing}</Typography></TableCell>
                  <TableCell align="right"><Typography fontSize={13} color={r.stock <= 0 ? 'error.main' : undefined}>{num(r.stock)}</Typography></TableCell>
                  <TableCell align="right">{r.pendingOrders || ''}</TableCell>
                  <TableCell align="right">{num(r.monthlySales)}</TableCell>
                  <TableCell align="right">{r.reorderLevel || ''}</TableCell>
                  <TableCell>{r.supplierName || '—'}</TableCell>
                  <TableCell align="right">{amt(r.rate)}</TableCell>
                  <TableCell align="right"><Cell value={r.take} onChange={(v) => set(i, { take: v, sel: true })} /></TableCell>
                </TableRow>
              ))}
              {!loading && !rows.length && (
                <TableRow><TableCell colSpan={9}><Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary">
                  Nothing needs reordering{onlySupplier && supplier ? ` from ${supplier.name} — try switching off the supplier filter` : ''}. (Set reorder levels in the product master for better suggestions.)
                </Typography></Box></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ mr: 'auto', ml: 2 }} fontSize={13}>{sel.length} of {rows.length} selected</Typography>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!sel.length} onClick={() => onAdd(sel.map((r) => ({ ...r, take: n(r.take) })))}>Add to PO</Button>
      </DialogActions>
    </Dialog>
  );
}
