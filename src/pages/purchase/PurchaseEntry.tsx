import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Grid, IconButton, MenuItem,
  Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useHotkey } from '../../lib/hooks';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { amt, drcr, fexp, inr, isoDate, parseExpiry, round2, today } from '../../lib/format';
import { readSheet } from '../../lib/excel';
import { GST_RATES, type Voucher } from '../../lib/types';
import { calcLine, calcTotals } from '../sales/calc';

interface PLine {
  key: string;
  product: { _id: string; name: string; manufacturerName: string; packing: string; gstRate: number; ptr?: number; mrp?: number } | null;
  batchNo: string;
  expiry: string; // MM/YY text as typed
  mrp: number;
  ptr: number;
  pts: number;
  qty: number;
  freeQty: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  orderItem?: string;
  rawName?: string; // from import, when product unmatched
}

let seq = 0;
const k = () => `p${++seq}`;
const blank = (): PLine => ({ key: k(), product: null, batchNo: '', expiry: '', mrp: 0, ptr: 0, pts: 0, qty: 0, freeQty: 0, rate: 0, discountPct: 0, gstRate: 12 });
const expText = (d?: string) => (d ? fexp(d) : '');
const emptyEntry = { batchNo: '', expiry: '', mrp: '', ptr: '', pts: '', qty: '', freeQty: '', rate: '', discountPct: '', gstRate: '12' };

// The bill as typed so far — auto-saved (see useDraft) so leaving the
// screen, a refresh or a power cut doesn't lose it.
interface Draft {
  party: PartyOption | null; supplierInvoiceNo: string; supplierInvoiceDate: string; date: string; cdPct: string; freight: string;
  narration: string; updateRates: boolean; lines: PLine[]; purchaseOrder?: string; dnAdjust: Record<string, number>;
  entry: { ep: ProductOption; e: typeof emptyEntry } | null;
}
const draftLabel = (d: unknown) => {
  const x = d as Draft;
  return `${x.party?.name || 'no supplier yet'}${x.supplierInvoiceNo ? ` bill ${x.supplierInvoiceNo}` : ''} · ${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`;
};

// Header names commonly found in supplier invoice exports, mapped to our fields.
const IMPORT_ALIASES: Record<string, string[]> = {
  name: ['product', 'item', 'item name', 'product name', 'description', 'name'],
  batchNo: ['batch', 'batch no', 'batchno', 'batch number'],
  expiry: ['expiry', 'exp', 'exp date', 'expiry date', 'exp.'],
  mrp: ['mrp'],
  ptr: ['ptr', 'rate to retailer'],
  pts: ['pts'],
  qty: ['qty', 'quantity', 'billed qty'],
  freeQty: ['free', 'free qty', 'scheme qty', 'sch qty'],
  rate: ['rate', 'purchase rate', 'p.rate', 'prate', 'net rate'],
  discountPct: ['disc', 'disc %', 'discount', 'discount %', 'td %'],
  gstRate: ['gst', 'gst %', 'gst rate', 'tax %'],
};

export default function PurchaseEntry() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { business } = useAuth();
  const roundOff = business?.settings?.roundOff !== false;
  // Auto-save: restored when the screen opens empty (or for the same bill
  // being edited); offered when it opens for a PO/party.
  const [draftReady, setDraftReady] = useState(false);
  const [docUpdatedAt, setDocUpdatedAt] = useState<number | undefined>();

  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyStateCode, setPartyStateCode] = useState('');
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(today());
  const [date, setDate] = useState(today());
  const [cdPct, setCdPct] = useState('');
  const [freight, setFreight] = useState('');
  const [narration, setNarration] = useState('');
  const [updateRates, setUpdateRates] = useState(true);
  const [lines, setLines] = useState<PLine[]>([]);
  const [purchaseOrder, setPurchaseOrder] = useState<string | undefined>();
  const [notes, setNotes] = useState<{ _id: string; number: string; balance: number }[]>([]);
  const [dnAdjust, setDnAdjust] = useState<Record<string, number>>({});
  const [docNumber, setDocNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Voucher | null>(null);
  const [importRows, setImportRows] = useState<Record<string, unknown>[] | null>(null);

  // entry row
  const [ep, setEp] = useState<ProductOption | null>(null);
  const [e, setE] = useState(emptyEntry);
  const refs = {
    product: useRef<HTMLInputElement>(null), batchNo: useRef<HTMLInputElement>(null), expiry: useRef<HTMLInputElement>(null), mrp: useRef<HTMLInputElement>(null),
    ptr: useRef<HTMLInputElement>(null), qty: useRef<HTMLInputElement>(null), freeQty: useRef<HTMLInputElement>(null), rate: useRef<HTMLInputElement>(null), discountPct: useRef<HTMLInputElement>(null),
  };
  const partyRef = useRef<HTMLInputElement>(null);

  const inter = !!(partyStateCode && business?.stateCode && partyStateCode !== business.stateCode);

  useEffect(() => {
    if (!party) { setPartyStateCode(''); setNotes([]); setPartyBalance(null); return; }
    api.get(`/parties/${party._id}`).then((r) => { setPartyStateCode(r.data.data.stateCode); setPartyBalance(r.data.data.balance); }).catch(() => {});
    api.get('/open-bills', { params: { party: party._id, kind: 'payment' } }).then((r) => setNotes(r.data.notes)).catch(() => {});
  }, [party]);

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const pu: Voucher = (await api.get(`/purchases/${id}`)).data.data;
          if (pu.status !== 'active') { nav(`/purchases/${id}`); return; }
          setDocNumber(pu.number);
          setParty({ _id: pu.party, name: pu.partyName });
          setSupplierInvoiceNo(pu.supplierInvoiceNo); setSupplierInvoiceDate(isoDate(pu.supplierInvoiceDate)); setDate(isoDate(pu.date));
          setCdPct(String(pu.cdPct || '')); setFreight(pu.freight ? String(pu.freight) : ''); setNarration(pu.narration || '');
          setPurchaseOrder(pu.purchaseOrder);
          setDnAdjust(Object.fromEntries((pu.debitNoteAdjustments || []).map((a: { doc: string; amount: number }) => [a.doc, a.amount])));
          setLines(pu.items.map((l) => ({
            key: k(), product: { _id: l.product, name: l.productName, manufacturerName: l.manufacturerName, packing: l.packing, gstRate: l.gstRate },
            batchNo: l.batchNo, expiry: expText(l.expiry), mrp: l.mrp, ptr: l.ptr, pts: l.pts, qty: l.qty, freeQty: l.freeQty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, orderItem: l.orderItem,
          })));
          setDocUpdatedAt(pu.updatedAt ? Date.parse(pu.updatedAt) : undefined);
          setDraftReady(true);
          return;
        }
        const po = sp.get('po');
        if (po) {
          const o = (await api.get(`/purchase-orders/${po}`)).data.data;
          setPurchaseOrder(po);
          setParty({ _id: o.party, name: o.partyName });
          const pending = o.items.filter((i: { qty: number; fulfilledQty: number }) => i.qty > i.fulfilledQty);
          const prods = await Promise.all(pending.map((i: { product: string }) => api.get(`/products/${i.product}`).then((r) => r.data.data)));
          setLines(pending.map((i: { product: string; productName: string; manufacturerName: string; packing: string; qty: number; fulfilledQty: number; freeQty: number; rate: number; discountPct: number; _id: string }, idx: number) => ({
            ...blank(), product: { _id: i.product, name: i.productName, manufacturerName: i.manufacturerName, packing: i.packing, gstRate: prods[idx]?.gstRate ?? 12 },
            qty: i.qty - i.fulfilledQty, freeQty: i.freeQty, rate: i.rate, discountPct: i.discountPct, mrp: prods[idx]?.mrp || 0, ptr: prods[idx]?.ptr || 0, pts: prods[idx]?.pts || 0,
            gstRate: prods[idx]?.gstRate ?? 12, orderItem: i._id,
          })));
          enqueueSnackbar('Loaded from purchase order — fill batch, expiry and MRP for each line.', { variant: 'info' });
          setDraftReady(true);
          return;
        }
        const pid = sp.get('party');
        if (pid) {
          const r = await api.get(`/parties/${pid}`);
          setParty({ _id: pid, name: r.data.data.name });
        }
        setDraftReady(true);
      } catch (err) { enqueueSnackbar(errMsg(err), { variant: 'error' }); if (!id) setDraftReady(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const applyDraft = (d: Draft) => {
    setParty(d.party); setSupplierInvoiceNo(d.supplierInvoiceNo); setSupplierInvoiceDate(d.supplierInvoiceDate); setDate(d.date);
    setCdPct(d.cdPct); setFreight(d.freight); setNarration(d.narration); setUpdateRates(d.updateRates);
    setPurchaseOrder(d.purchaseOrder); setDnAdjust(d.dnAdjust || {});
    setLines((d.lines || []).map((l) => ({ ...l, key: k() })));
    setEp(d.entry?.ep || null); setE(d.entry?.e || emptyEntry);
  };
  const resetForNew = () => {
    setParty(null); setSupplierInvoiceNo(''); setSupplierInvoiceDate(today()); setDate(today()); setCdPct(''); setFreight(''); setNarration('');
    setUpdateRates(true); setLines([]); setPurchaseOrder(undefined); setDnAdjust({}); setEp(null); setE(emptyEntry);
  };

  const hasParams = !!(sp.get('po') || sp.get('party'));
  const draft = useDraft<Draft>({
    key: id ? `purchase:${id}` : 'purchase:new',
    ready: draftReady,
    autoRestore: !!id || !hasParams,
    // Supplier alone isn't kept: "New purchase" after a save keeps the supplier on an empty form.
    value: lines.length || supplierInvoiceNo.trim() || ep
      ? { party, supplierInvoiceNo, supplierInvoiceDate, date, cdPct, freight, narration, updateRates, lines, purchaseOrder, dnAdjust, entry: ep ? { ep, e } : null }
      : null,
    apply: applyDraft,
    paused: !!saved,
    notBefore: id ? docUpdatedAt : undefined,
  });
  const discardDraft = () => { draft.clear(); if (id) nav(`/purchases/${id}`); else resetForNew(); };

  const cd = Number(cdPct) || 0;
  const computed = useMemo(() => lines.map((l) => calcLine(l, inter, cd)), [lines, inter, cd]);
  const totals = useMemo(() => calcTotals(computed, Number(freight) || 0, roundOff), [computed, freight, roundOff]);
  const dnTotal = Object.values(dnAdjust).reduce((s, v) => s + (Number(v) || 0), 0);

  const onProduct = async (p: ProductOption | null) => {
    setEp(p);
    if (!p) return;
    try {
      const full = (await api.get(`/products/${p._id}`)).data.data;
      setE({ batchNo: '', expiry: '', mrp: String(full.mrp || ''), ptr: String(full.ptr || ''), pts: String(full.pts || ''), qty: '', freeQty: '', rate: String(full.purchaseRate || ''), discountPct: '', gstRate: String(full.gstRate) });
    } catch { /* keep defaults */ }
    setTimeout(() => refs.batchNo.current?.focus(), 40);
  };

  const addEntry = () => {
    if (!ep) return;
    if (!e.batchNo.trim()) { refs.batchNo.current?.focus(); return; }
    if (!parseExpiry(e.expiry)) { enqueueSnackbar('Expiry like 08/27', { variant: 'warning' }); refs.expiry.current?.focus(); return; }
    if (!(Number(e.qty) > 0) && !(Number(e.freeQty) > 0)) { refs.qty.current?.focus(); return; }
    setLines((ls) => [...ls, {
      key: k(), product: { _id: ep._id, name: ep.name, manufacturerName: ep.manufacturerName, packing: ep.packing, gstRate: Number(e.gstRate) },
      batchNo: e.batchNo.trim().toUpperCase(), expiry: e.expiry, mrp: Number(e.mrp) || 0, ptr: Number(e.ptr) || 0, pts: Number(e.pts) || 0,
      qty: Number(e.qty) || 0, freeQty: Number(e.freeQty) || 0, rate: Number(e.rate) || 0, discountPct: Number(e.discountPct) || 0, gstRate: Number(e.gstRate),
    }]);
    setEp(null);
    setE(emptyEntry);
    setTimeout(() => refs.product.current?.focus(), 30);
  };

  const enter = (next?: React.RefObject<HTMLInputElement>, action?: () => void) => (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter') { ev.preventDefault(); if (action) action(); else next?.current?.focus(); }
  };
  const upd = (key: string, patch: Partial<PLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ---- import supplier invoice ----
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { setImportRows(await readSheet(f)); } catch (err) { enqueueSnackbar(errMsg(err, 'Could not read the file.'), { variant: 'error' }); }
  };
  const applyImport = async (mapping: Record<string, string>) => {
    if (!importRows) return;
    const get = (row: Record<string, unknown>, f: string) => (mapping[f] ? row[mapping[f]] : '');
    const out: PLine[] = [];
    let unmatched = 0;
    for (const row of importRows) {
      const name = String(get(row, 'name') || '').trim();
      if (!name) continue;
      let product: PLine['product'] = null;
      try {
        const r = await api.get('/products/lookup', { params: { q: name } });
        const hit = (r.data.data as ProductOption[]).find((p) => p.name.toLowerCase() === name.toLowerCase()) || (r.data.data.length === 1 ? r.data.data[0] : null);
        if (hit) product = { _id: hit._id, name: hit.name, manufacturerName: hit.manufacturerName, packing: hit.packing, gstRate: hit.gstRate };
      } catch { /* leave unmatched */ }
      if (!product) unmatched++;
      const rawExp = get(row, 'expiry');
      const exp = rawExp instanceof Date ? expText(rawExp.toISOString()) : String(rawExp || '');
      const gst = Number(get(row, 'gstRate'));
      out.push({
        key: k(), product, rawName: name, batchNo: String(get(row, 'batchNo') || '').toUpperCase(), expiry: exp,
        mrp: Number(get(row, 'mrp')) || 0, ptr: Number(get(row, 'ptr')) || 0, pts: Number(get(row, 'pts')) || 0,
        qty: Number(get(row, 'qty')) || 0, freeQty: Number(get(row, 'freeQty')) || 0, rate: Number(get(row, 'rate')) || 0,
        discountPct: Number(get(row, 'discountPct')) || 0, gstRate: GST_RATES.includes(gst) ? gst : product?.gstRate ?? 12,
      });
    }
    setLines((ls) => [...ls, ...out]);
    setImportRows(null);
    enqueueSnackbar(`${out.length} lines imported${unmatched ? ` · ${unmatched} need a product picked (highlighted)` : ''}.`, { variant: unmatched ? 'warning' : 'success' });
  };

  // ---- save ----
  const save = async () => {
    if (saving) return;
    if (!party) { enqueueSnackbar('Choose the supplier.', { variant: 'warning' }); partyRef.current?.focus(); return; }
    if (!supplierInvoiceNo.trim()) { enqueueSnackbar('Enter the supplier bill number.', { variant: 'warning' }); return; }
    const bad = lines.findIndex((l) => !l.product || !l.batchNo || !parseExpiry(l.expiry) || !(l.mrp > 0));
    if (bad >= 0) { enqueueSnackbar(`Row ${bad + 1}: product, batch, expiry (MM/YY) and MRP are required.`, { variant: 'warning' }); return; }
    if (!lines.length) { enqueueSnackbar('Add at least one item.', { variant: 'warning' }); return; }
    setSaving(true);
    const body = {
      date, party: party._id, supplierInvoiceNo, supplierInvoiceDate, cdPct: cd, freight: Number(freight) || 0, narration, purchaseOrder, updateProductRates: updateRates,
      items: lines.map((l) => ({ product: l.product!._id, batchNo: l.batchNo, expiry: parseExpiry(l.expiry), mrp: l.mrp, ptr: l.ptr, pts: l.pts, qty: l.qty, freeQty: l.freeQty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, orderItem: l.orderItem })),
      debitNoteAdjustments: Object.entries(dnAdjust).filter(([, v]) => Number(v) > 0).map(([doc, amount]) => ({ doc, amount: Number(amount) })),
    };
    try {
      const r = id ? await api.put(`/purchases/${id}`, body) : await api.post('/purchases', body);
      setSaved(r.data.data);
      draft.clear();
      enqueueSnackbar(`Purchase ${r.data.data.number} saved — stock updated.`, { variant: 'success' });
    } catch (err) { enqueueSnackbar(errMsg(err), { variant: 'error' }); }
    finally { setSaving(false); }
  };
  useHotkey('f2', save);
  useHotkey('ctrl+s', save);
  useHotkey('f3', () => refs.product.current?.focus());

  const marginPct = (l: { ptr: number; rate: number; discountPct: number; qty: number; freeQty: number }) => {
    const units = l.qty + l.freeQty;
    if (!l.ptr || !units) return null;
    const cost = (l.qty * l.rate * (1 - l.discountPct / 100)) / units;
    return round2(((l.ptr - cost) / l.ptr) * 100);
  };

  return (
    <>
      <PageHeader
        help={['pts', 'ptr', 'mrp', 'scheme', 'landing', 'batch', 'itc']}
        title={id ? `Edit Purchase ${docNumber}` : 'New Purchase'}
        crumbs={[{ label: 'Purchase', to: '/purchases' }, { label: id ? 'Edit' : 'New' }]}
        subtitle="Enter the supplier bill line by line — batches and stock are created on save. F3 product · Enter next · F2 save"
        actions={
          <>
            <DraftStatus draft={draft} />
            <Button component="label" variant="outlined" startIcon={<UploadFileOutlinedIcon />}>
              Import supplier bill
              <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(ev) => { onFile(ev.target.files?.[0]); ev.target.value = ''; }} />
            </Button>
            <Button onClick={() => nav(-1)}>Close</Button>
            <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
          </>
        }
      />
      <DraftBanner draft={draft} label={draftLabel} onDiscard={discardDraft} onOpen={() => { if (sp.toString()) nav('/purchases/new', { replace: true }); }} />

      <Paper sx={{ p: 1.5, mb: 1.5 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={4}><PartyPicker type="supplier" value={party} onChange={setParty} inputRef={partyRef} autoFocus={!id} disabled={!!id} quickCreate /></Grid>
          <Grid item xs={6} md={2}><TextField label="Supplier bill no" value={supplierInvoiceNo} onChange={(ev) => setSupplierInvoiceNo(ev.target.value)} fullWidth required /></Grid>
          <Grid item xs={6} md={2}><TextField type="date" label="Supplier bill date" value={supplierInvoiceDate} onChange={(ev) => setSupplierInvoiceDate(ev.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={6} md={2}><TextField type="date" label="Received on" value={date} onChange={(ev) => setDate(ev.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={6} md={1}><TextField label="CD %" value={cdPct} onChange={(ev) => setCdPct(ev.target.value)} fullWidth /></Grid>
          <Grid item xs={12} md={1}>{partyStateCode && <Chip label={inter ? 'IGST' : 'CGST+SGST'} variant="outlined" />}</Grid>
        </Grid>
        {partyBalance !== null && <Typography fontSize={12} color="text.secondary" mt={1}>Supplier balance {drcr(partyBalance)}</Typography>}
      </Paper>

      <Paper sx={{ p: 1.5, mb: 1.5, borderColor: 'primary.light' }}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} md={3}><ProductPicker value={ep} onChange={onProduct} inputRef={refs.product} label="Product (F3)" quickCreate /></Grid>
          <Grid item xs={4} md={1.1}><TextField label="Batch" value={e.batchNo} inputRef={refs.batchNo} onChange={(ev) => setE({ ...e, batchNo: ev.target.value.toUpperCase() })} onKeyDown={enter(refs.expiry)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.9}><TextField label="Exp MM/YY" value={e.expiry} inputRef={refs.expiry} onChange={(ev) => setE({ ...e, expiry: ev.target.value })} onKeyDown={enter(refs.mrp)} disabled={!ep} error={!!e.expiry && !parseExpiry(e.expiry)} /></Grid>
          <Grid item xs={4} md={0.9}><TextField label="MRP" value={e.mrp} inputRef={refs.mrp} onChange={(ev) => setE({ ...e, mrp: ev.target.value })} onKeyDown={enter(refs.ptr)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.9}><TextField label="PTR" value={e.ptr} inputRef={refs.ptr} onChange={(ev) => setE({ ...e, ptr: ev.target.value })} onKeyDown={enter(refs.qty)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.8}><TextField label="Qty" value={e.qty} inputRef={refs.qty} onChange={(ev) => setE({ ...e, qty: ev.target.value })} onKeyDown={enter(refs.freeQty)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.8}><TextField label="Free" value={e.freeQty} inputRef={refs.freeQty} onChange={(ev) => setE({ ...e, freeQty: ev.target.value })} onKeyDown={enter(refs.rate)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.9}><TextField label="Rate" value={e.rate} inputRef={refs.rate} onChange={(ev) => setE({ ...e, rate: ev.target.value })} onKeyDown={enter(refs.discountPct)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.8}><TextField label="Disc%" value={e.discountPct} inputRef={refs.discountPct} onChange={(ev) => setE({ ...e, discountPct: ev.target.value })} onKeyDown={enter(undefined, addEntry)} disabled={!ep} /></Grid>
          <Grid item xs={4} md={0.9}>
            <TextField select label="GST" value={e.gstRate} onChange={(ev) => setE({ ...e, gstRate: ev.target.value })} disabled={!ep} fullWidth>
              {GST_RATES.map((g) => <MenuItem key={g} value={String(g)}>{g}%</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={1}><Button fullWidth variant="outlined" onClick={addEntry} disabled={!ep}>Add</Button></Grid>
        </Grid>
      </Paper>

      <Grid container spacing={1.5}>
        <Grid item xs={12} lg={9}>
          <Paper sx={{ overflow: 'auto' }}>
            <Table sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Product</TableCell><TableCell width={90}>Batch</TableCell><TableCell width={70}>Exp</TableCell>
                  <TableCell align="right" width={70}>MRP</TableCell><TableCell align="right" width={70}>PTR</TableCell><TableCell align="right" width={60}>Qty</TableCell>
                  <TableCell align="right" width={55}>Free</TableCell><TableCell align="right" width={75}>Rate</TableCell><TableCell align="right" width={55}>Disc%</TableCell>
                  <TableCell align="right" width={60}>GST</TableCell><TableCell align="right">Taxable</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">Margin</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l, i) => {
                  const c = computed[i];
                  const m = marginPct(l);
                  return (
                    <TableRow key={l.key} sx={{ bgcolor: !l.product ? 'rgba(237,108,2,0.08)' : undefined }}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell sx={{ minWidth: 220 }}>
                        {l.product ? (
                          <><Typography fontSize={13} fontWeight={600}>{l.product.name}</Typography><Typography fontSize={11} color="text.secondary">{l.product.manufacturerName} · {l.product.packing}</Typography></>
                        ) : (
                          <ProductPicker value={null} label={`Match: ${l.rawName || 'product'}`} quickCreate quickCreateName={l.rawName} onChange={(p) => p && upd(l.key, { product: { _id: p._id, name: p.name, manufacturerName: p.manufacturerName, packing: p.packing, gstRate: p.gstRate } })} />
                        )}
                      </TableCell>
                      <TableCell><Cell text value={l.batchNo} onChange={(v) => upd(l.key, { batchNo: String(v).toUpperCase() })} /></TableCell>
                      <TableCell><Cell text value={l.expiry} onChange={(v) => upd(l.key, { expiry: String(v) })} error={!parseExpiry(l.expiry)} /></TableCell>
                      <TableCell align="right"><Cell value={l.mrp} onChange={(v) => upd(l.key, { mrp: Number(v) })} error={!(l.mrp > 0)} /></TableCell>
                      <TableCell align="right"><Cell value={l.ptr} onChange={(v) => upd(l.key, { ptr: Number(v) })} /></TableCell>
                      <TableCell align="right"><Cell value={l.qty} onChange={(v) => upd(l.key, { qty: Number(v) })} /></TableCell>
                      <TableCell align="right"><Cell value={l.freeQty} onChange={(v) => upd(l.key, { freeQty: Number(v) })} /></TableCell>
                      <TableCell align="right"><Cell value={l.rate} onChange={(v) => upd(l.key, { rate: Number(v) })} /></TableCell>
                      <TableCell align="right"><Cell value={l.discountPct} onChange={(v) => upd(l.key, { discountPct: Number(v) })} /></TableCell>
                      <TableCell align="right">
                        <TextField select variant="standard" value={l.gstRate} onChange={(ev) => upd(l.key, { gstRate: Number(ev.target.value) })} InputProps={{ disableUnderline: true }} sx={{ '& .MuiSelect-select': { fontSize: 13, py: 0 } }}>
                          {GST_RATES.map((g) => <MenuItem key={g} value={g}>{g}%</MenuItem>)}
                        </TextField>
                      </TableCell>
                      <TableCell align="right">{amt(c.taxable)}</TableCell>
                      <TableCell align="right"><b>{amt(c.total)}</b></TableCell>
                      <TableCell align="right">
                        {m !== null && <Tooltip title="Margin on PTR after free qty and discount"><Typography fontSize={12} color={m < 8 ? 'error.main' : m < 12 ? 'warning.dark' : 'success.main'}>{m}%</Typography></Tooltip>}
                      </TableCell>
                      <TableCell><IconButton onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  );
                })}
                {!lines.length && <TableRow><TableCell colSpan={15}><Typography color="text.secondary" textAlign="center" py={3}>Add lines above, or import the supplier's invoice file.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>
          <TextField label="Narration" value={narration} onChange={(ev) => setNarration(ev.target.value)} fullWidth sx={{ mt: 1.5 }} />
          <FormControlLabel sx={{ mt: 0.5 }} control={<Checkbox size="small" checked={updateRates} onChange={(ev) => setUpdateRates(ev.target.checked)} />} label={<Typography fontSize={13}>Update product master MRP / PTR / PTS / purchase rate from this bill</Typography>} />
        </Grid>
        <Grid item xs={12} lg={3}>
          <Paper sx={{ p: 1.5, position: { lg: 'sticky' }, top: { lg: 64 } }}>
            <R k="Lines" v={`${lines.length} · qty ${lines.reduce((s, l) => s + l.qty, 0)} + ${lines.reduce((s, l) => s + l.freeQty, 0)} free`} />
            <R k="Gross" v={amt(totals.gross)} />
            {totals.disc > 0 && <R k="Discount" v={`− ${amt(totals.disc)}`} />}
            {totals.cd > 0 && <R k={`CD ${cd}%`} v={`− ${amt(totals.cd)}`} />}
            <R k="Taxable" v={amt(totals.taxable)} />
            {inter ? <R k="IGST" v={amt(totals.igst)} /> : <><R k="CGST" v={amt(totals.cgst)} /><R k="SGST" v={amt(totals.sgst)} /></>}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', my: 0.5 }}>
              <Typography fontSize={13} color="text.secondary">Freight</Typography>
              <TextField value={freight} onChange={(ev) => setFreight(ev.target.value)} sx={{ width: 100 }} inputProps={{ style: { textAlign: 'right' } }} />
            </Box>
            {totals.roundOff !== 0 && <R k="Round off" v={amt(totals.roundOff)} />}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography fontWeight={700}>Bill total</Typography>
              <Typography fontWeight={800} fontSize={22} color="primary.dark">{inr(totals.grand)}</Typography>
            </Box>
            <Typography fontSize={11} color="text.secondary">Check this matches the supplier's bill total before saving.</Typography>
            {notes.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography fontSize={12} fontWeight={600}>Adjust debit notes</Typography>
                {notes.map((n) => (
                  <FormControlLabel key={n._id} sx={{ display: 'flex', m: 0 }}
                    control={<Checkbox size="small" checked={(dnAdjust[n._id] || 0) > 0} onChange={(ev) => setDnAdjust({ ...dnAdjust, [n._id]: ev.target.checked ? Math.min(n.balance, Math.max(0, totals.grand - dnTotal)) : 0 })} />}
                    label={<Typography fontSize={12}>{n.number} · {inr(n.balance)}</Typography>} />
                ))}
                {dnTotal > 0 && <R k="Net payable" v={inr(totals.grand - dnTotal)} />}
              </Box>
            )}
            <Button fullWidth variant="contained" size="large" sx={{ mt: 1.5 }} onClick={save} disabled={saving || !lines.length}>{saving ? 'Saving…' : 'Save purchase (F2)'}</Button>
          </Paper>
        </Grid>
      </Grid>

      <ImportDialog rows={importRows} onClose={() => setImportRows(null)} onApply={applyImport} />

      <Dialog open={!!saved} maxWidth="xs" fullWidth>
        <DialogTitle>Purchase saved</DialogTitle>
        <DialogContent><Alert severity="success">{saved?.number} · {saved?.partyName} bill {saved?.supplierInvoiceNo} · {inr(saved?.grandTotal)}. Stock is updated.</Alert></DialogContent>
        <DialogActions>
          <Button onClick={() => saved && nav(`/purchases/${saved._id}`)}>Open</Button>
          <Button variant="contained" onClick={() => { setSaved(null); if (id) nav('/purchases/new'); else { setLines([]); setSupplierInvoiceNo(''); setNarration(''); setFreight(''); setDnAdjust({}); setPurchaseOrder(undefined); } }}>New purchase</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const R = ({ k: label, v }: { k: string; v: React.ReactNode }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography fontSize={13} color="text.secondary">{label}</Typography><Typography fontSize={13}>{v}</Typography>
  </Box>
);

function Cell({ value, onChange, error, text }: { value: string | number; onChange: (v: string | number) => void; error?: boolean; text?: boolean }) {
  const [t, setT] = useState(String(value ?? ''));
  useEffect(() => { if ((text ? t : Number(t)) !== value) setT(String(value ?? '')); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextField variant="standard" value={t} error={error}
      onChange={(ev) => { setT(ev.target.value); if (text) onChange(ev.target.value); else if (!Number.isNaN(Number(ev.target.value))) onChange(Number(ev.target.value)); }}
      InputProps={{ disableUnderline: !error }} inputProps={{ style: { textAlign: text ? 'left' : 'right', fontSize: 13, padding: '2px 0' } }} sx={{ width: '100%' }} />
  );
}

function ImportDialog({ rows, onClose, onApply }: { rows: Record<string, unknown>[] | null; onClose: () => void; onApply: (m: Record<string, string>) => void }) {
  const headers = rows?.length ? Object.keys(rows[0]) : [];
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) {
      const h = headers.find((x) => aliases.includes(x.trim().toLowerCase()));
      if (h) m[field] = h;
    }
    setMap(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const LABEL: Record<string, string> = { name: 'Product name *', batchNo: 'Batch *', expiry: 'Expiry *', mrp: 'MRP *', ptr: 'PTR', pts: 'PTS', qty: 'Qty *', freeQty: 'Free', rate: 'Rate *', discountPct: 'Disc %', gstRate: 'GST %' };
  return (
    <Dialog open={!!rows} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import supplier bill · {rows?.length || 0} rows</DialogTitle>
      <DialogContent>
        <Typography fontSize={13} color="text.secondary" mb={1.5}>Match the columns in the supplier's file. Products are matched by exact name; anything not matched is highlighted so you can pick it.</Typography>
        <Grid container spacing={1}>
          {Object.keys(IMPORT_ALIASES).map((f) => (
            <Grid item xs={6} sm={4} md={3} key={f}>
              <TextField select fullWidth label={LABEL[f]} value={map[f] || ''} onChange={(ev) => setMap({ ...map, [f]: ev.target.value })}>
                <MenuItem value="">— none —</MenuItem>
                {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
              </TextField>
            </Grid>
          ))}
        </Grid>
        {rows && rows.length > 0 && (
          <Box sx={{ mt: 2, maxHeight: 220, overflow: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>{headers.map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows.slice(0, 8).map((r, i) => <TableRow key={i}>{headers.map((h) => <TableCell key={h}>{String(r[h] instanceof Date ? (r[h] as Date).toLocaleDateString() : r[h] ?? '')}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!map.name || !map.qty} onClick={() => onApply(map)}>Import lines</Button>
      </DialogActions>
    </Dialog>
  );
}
