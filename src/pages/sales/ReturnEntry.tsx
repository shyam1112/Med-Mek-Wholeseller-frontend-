// Credit note (sales return) and debit note (purchase return) entry.
// Two modes: against a bill (bill lines with returnable qty) or free entry
// (product → batch). Purchase side also loads damaged / expired stock.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, IconButton, LinearProgress, MenuItem, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { useHotkey } from '../../lib/hooks';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { amt, fdate, fexp, round2, today } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import type { Batch, Product, Voucher } from '../../lib/types';
import ReturnBatchStrip, { SoldBatch, defaultReturnBatch, matchBatchNo } from './ReturnBatchStrip';
import { BatchSelect, PURCHASE_REASONS, ReturnKind, ReturnSavedDialog, SALES_REASONS, TotRow, returnLineAmount } from './returnParts';

type RType = 'saleable' | 'expiry' | 'breakage';
type Bucket = 'saleable' | 'damaged';

interface RLine {
  key: string; product: string; productName: string; manufacturerName: string; packing: string; gstRate: number;
  batch: string; batchNo: string; expiry?: string; isExpired?: boolean;
  qty: string; freeQty: string; rate: string; discountPct: string; claimPct: string;
  returnType: RType; stockBucket: Bucket;
  sold?: number; already?: number; avail?: number;
  // Free-entry sales return: what's still returnable from this party's bills (undefined = never sold to them).
  partyReturnable?: number; notSold?: boolean;
}

let seq = 0;
const nk = () => `r${++seq}`;
const n = (s: string | number | undefined) => Number(s) || 0;

const CFG = {
  sales: {
    title: 'New Credit Note', subtitle: 'Sales return — goods back from a customer', crumbs: [{ label: 'Credit Notes', to: '/sales-returns' }],
    returnsUrl: '/sales-returns', billsUrl: '/sales', againstField: 'againstInvoice', partyType: 'customer' as const, reasons: SALES_REASONS, defaultReason: 'saleable',
    billWord: 'sales bill',
  },
  purchase: {
    title: 'New Debit Note', subtitle: 'Purchase return / expiry claim to supplier', crumbs: [{ label: 'Debit Notes', to: '/purchase-returns' }],
    returnsUrl: '/purchase-returns', billsUrl: '/purchases', againstField: 'againstPurchase', partyType: 'supplier' as const, reasons: PURCHASE_REASONS, defaultReason: 'expiry',
    billWord: 'purchase bill',
  },
};

const typeForReason = (r: string, expired?: boolean): RType => (r === 'expiry' || r === 'breakage' ? r : expired ? 'expiry' : 'saleable');
const bucketForReason = (r: string): Bucket => (r === 'expiry' || r === 'breakage' ? 'damaged' : 'saleable');

const lineCalc = (l: RLine) => returnLineAmount(n(l.qty), n(l.rate), l.claimPct === '' ? 100 : n(l.claimPct), n(l.discountPct), l.gstRate);

// The note as typed so far — auto-saved (see useDraft) so leaving the
// screen, a refresh or a power cut doesn't lose it.
type Composer = { prod: ProductOption; draft: { batch: string; qty: string; freeQty: string; rate: string; discountPct: string; claimPct: string }; batchText: string };
interface ReturnDraft {
  date: string; party: PartyOption | null; against: Voucher | null; reason: string; lines: RLine[]; adjust: boolean; narration: string;
  composer: Composer | null;
}
const draftLabel = (d: unknown) => {
  const x = d as ReturnDraft;
  return `${x.party?.name || 'no party yet'}${x.against ? ` · against ${x.against.number}` : ''} · ${x.lines.length} line${x.lines.length === 1 ? '' : 's'}`;
};

export default function ReturnEntry({ kind }: { kind: ReturnKind }) {
  const c = CFG[kind];
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();

  const [date, setDate] = useState(today());
  const [party, setParty] = useState<PartyOption | null>(null);
  const [bills, setBills] = useState<Voucher[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [against, setAgainst] = useState<Voucher | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [reason, setReason] = useState(c.defaultReason);
  const [lines, setLines] = useState<RLine[]>([]);
  const [adjust, setAdjust] = useState(true);
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Voucher | null>(null);
  const [loaderOpen, setLoaderOpen] = useState(false);
  // Auto-save: restored when the screen opens empty; offered when it opens for a bill/party.
  const [draftReady, setDraftReady] = useState(false);
  const [restoreComposer, setRestoreComposer] = useState<Composer | null>(null);

  // Free-entry composer
  const [prod, setProd] = useState<ProductOption | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [draft, setDraft] = useState({ batch: '', qty: '', freeQty: '', rate: '', discountPct: '', claimPct: '100' });
  const [sold, setSold] = useState<Record<string, SoldBatch>>({});
  const [batchText, setBatchText] = useState('');
  const pickSeq = useRef(0);
  const productRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // ---- preload from query (?invoice= for sales, ?purchase=&party= for purchase) ----
  useEffect(() => {
    const billId = sp.get(kind === 'sales' ? 'invoice' : 'purchase');
    const partyId = sp.get('party');
    (async () => {
      try {
        if (billId) {
          const r = await api.get(`${c.billsUrl}/${billId}`);
          const bill = r.data.data as Voucher;
          setParty({ _id: bill.party, name: bill.partyName, mobile: bill.partyPhone });
          await chooseBill(bill, bill.party);
        } else if (partyId) {
          const r = await api.get(`/parties/${partyId}`);
          setParty({ _id: r.data.data._id, name: r.data.data.name, mobile: r.data.data.mobile });
        }
      } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
      setDraftReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- party's bills for "against bill" ----
  useEffect(() => {
    setBills([]);
    if (!party?._id) return;
    let alive = true;
    setBillsLoading(true);
    api.get(c.billsUrl, { params: { party: party._id, status: 'active', limit: 100 } })
      .then((r) => { if (alive) setBills(r.data.data); })
      .catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }))
      .finally(() => alive && setBillsLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party?._id]);

  const changeParty = (p: PartyOption | null) => {
    setParty(p);
    setAgainst(null);
    setLines([]);
    pickProduct(null); // sold-batch history belongs to the old party
  };

  // Loads the bill's lines with how much of each batch was already returned.
  async function chooseBill(bill: Voucher | null, partyId?: string) {
    setAgainst(bill);
    setLines([]);
    if (!bill) return;
    setBillLoading(true);
    try {
      const full = bill.items?.length ? bill : (await api.get(`${c.billsUrl}/${bill._id}`)).data.data as Voucher;
      setAgainst(full);
      const prev = await api.get(c.returnsUrl, { params: { party: partyId || party?._id, status: 'active', limit: 500 } });
      const already = new Map<string, number>();
      for (const d of prev.data.data as Voucher[]) {
        if (String(d[c.againstField]) !== String(full._id)) continue;
        for (const l of d.items) already.set(String(l.batch), (already.get(String(l.batch)) || 0) + l.qty + (l.freeQty || 0));
      }
      const used = new Map<string, number>();
      setLines(full.items.map((l) => {
        const b = String(l.batch);
        const sold = l.qty + (l.freeQty || 0);
        // Same batch twice on a bill: spread the already-returned qty across lines.
        const prevQty = Math.max(0, (already.get(b) || 0) - (used.get(b) || 0));
        const take = Math.min(prevQty, sold);
        used.set(b, (used.get(b) || 0) + take);
        return {
          key: nk(), product: String(l.product), productName: l.productName, manufacturerName: l.manufacturerName, packing: l.packing,
          gstRate: l.gstRate, batch: b, batchNo: l.batchNo, expiry: l.expiry, isExpired: !!l.expiry && new Date(l.expiry) < new Date(),
          qty: '', freeQty: '', rate: String(l.rate), discountPct: l.discountPct ? String(l.discountPct) : '', claimPct: '100',
          returnType: typeForReason(reason, !!l.expiry && new Date(l.expiry) < new Date()), stockBucket: bucketForReason(reason), sold, already: take,
        };
      }));
      setAdjust((full.balance || 0) > 0.009);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setBillLoading(false);
    }
  }

  const changeReason = (r: string) => {
    setReason(r);
    setLines((ls) => ls.map((l) => ({ ...l, returnType: typeForReason(r, l.isExpired), stockBucket: bucketForReason(r) })));
  };

  // ---- free entry ----
  const pickProduct = async (p: ProductOption | null) => {
    const seq = ++pickSeq.current;
    setProd(p);
    setBatches([]);
    setSold({});
    setBatchText('');
    setDraft({ batch: '', qty: '', freeQty: '', rate: '', discountPct: '', claimPct: '100' });
    if (!p) return;
    setBatchesLoading(true);
    try {
      const [r, s] = await Promise.all([
        api.get(`/products/${p._id}/batches`, { params: { all: 'true', party: kind === 'sales' ? party?._id : undefined } }),
        kind === 'sales' && party ? api.get(`/parties/${party._id}/sold-batches`, { params: { product: p._id } }) : Promise.resolve(null),
      ]);
      if (seq !== pickSeq.current) return;
      const list = r.data.data as Batch[];
      setBatches(list);
      if (kind === 'sales') {
        const soldMap: Record<string, SoldBatch> = Object.fromEntries(((s?.data.data || []) as SoldBatch[]).map((x) => [String(x.batch), x]));
        setSold(soldMap);
        const def = defaultReturnBatch(list, soldMap, reason === 'expiry' || reason === 'breakage');
        if (def) chooseBatch(def, soldMap);
        setTimeout(() => (def ? qtyRef.current : batchRef.current)?.focus(), 50);
      } else {
        if (list.length === 1) chooseBatch(list[0]);
        setTimeout(() => (list.length === 1 ? qtyRef.current : batchRef.current)?.focus(), 50);
      }
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { if (seq === pickSeq.current) setBatchesLoading(false); }
  };

  // Sales returns credit at the rate the customer was billed for that batch;
  // a batch never sold to them falls back to PTR.
  function chooseBatch(b: Batch | undefined, soldMap = sold) {
    if (!b) return;
    const s = kind === 'sales' ? soldMap[b._id] : undefined;
    setDraft((d) => ({
      ...d, batch: b._id,
      rate: String(s ? s.lastRate : kind === 'sales' ? b.ptr : b.purchaseRate || b.ptr),
      discountPct: s ? (s.lastDiscountPct ? String(s.lastDiscountPct) : '') : d.discountPct,
    }));
    if (kind === 'sales') setBatchText(b.batchNo);
    setTimeout(() => qtyRef.current?.focus(), 30);
  }

  const onBatchText = (t: string) => {
    setBatchText(t.toUpperCase());
    const m = matchBatchNo(batches, t);
    setDraft((d) => ({ ...d, batch: m?._id || '' }));
  };

  const addDraft = () => {
    if (!prod) { productRef.current?.focus(); return; }
    const b = batches.find((x) => x._id === draft.batch);
    if (!b) { enqueueSnackbar('Choose the batch', { variant: 'warning' }); batchRef.current?.focus(); return; }
    if (!(n(draft.qty) + n(draft.freeQty) > 0)) { enqueueSnackbar('Enter quantity', { variant: 'warning' }); qtyRef.current?.focus(); return; }
    const expired = !!b.isExpired;
    // Expired goods coming back can never be saleable.
    const rt: RType = kind === 'sales' && expired && reason === 'saleable' ? 'expiry' : typeForReason(reason);
    const s = kind === 'sales' ? sold[b._id] : undefined;
    const qtyBack = n(draft.qty) + n(draft.freeQty);
    if (kind === 'sales' && !s) enqueueSnackbar(`Batch ${b.batchNo} was never sold to ${party?.name} — check before accepting.`, { variant: 'warning' });
    else if (s && qtyBack > s.returnable) enqueueSnackbar(`Only ${s.returnable} of batch ${b.batchNo} is returnable from ${party?.name}'s bills (sold ${s.sold}, returned ${s.returned}).`, { variant: 'warning' });
    const bucket: Bucket = kind === 'purchase' ? (b.damagedQty > 0 && reason !== 'saleable' ? 'damaged' : b.qty > 0 ? 'saleable' : 'damaged') : bucketForReason(reason);
    setLines((ls) => [...ls, {
      key: nk(), product: prod._id, productName: prod.name, manufacturerName: prod.manufacturerName, packing: prod.packing, gstRate: prod.gstRate,
      batch: b._id, batchNo: b.batchNo, expiry: b.expiry, isExpired: expired,
      qty: draft.qty, freeQty: draft.freeQty, rate: draft.rate, discountPct: draft.discountPct, claimPct: draft.claimPct || '100',
      returnType: rt, stockBucket: bucket, avail: kind === 'purchase' ? (bucket === 'damaged' ? b.damagedQty : b.qty) : undefined,
      partyReturnable: s?.returnable, notSold: kind === 'sales' && !s,
    }]);
    if (rt !== typeForReason(reason)) enqueueSnackbar(`Batch ${b.batchNo} is expired — marked as expiry return (damaged stock)`, { variant: 'info' });
    setProd(null); setBatches([]); setSold({}); setBatchText(''); setDraft({ batch: '', qty: '', freeQty: '', rate: '', discountPct: '', claimPct: '100' });
    setTimeout(() => productRef.current?.focus(), 30);
  };

  // Restored half-typed item: reload its batches (with the restored party's
  // sold history), then put back what was typed.
  useEffect(() => {
    if (!restoreComposer) return;
    const x = restoreComposer;
    setRestoreComposer(null);
    const p = pickProduct(x.prod);
    const mine = pickSeq.current;
    p.then(() => { if (mine === pickSeq.current) { setDraft(x.draft); setBatchText(x.batchText); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreComposer]);

  const upd = (key: string, patch: Partial<RLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ---- totals ----
  const active = lines.filter((l) => n(l.qty) + n(l.freeQty) > 0);
  const totals = useMemo(() => {
    let taxable = 0, tax = 0;
    for (const l of active) { const x = lineCalc(l); taxable += x.taxable; tax += x.tax; }
    return { taxable: round2(taxable), tax: round2(tax), total: Math.round(taxable + tax) };
  }, [active]);
  const damagedCount = active.filter((l) => (kind === 'sales' ? l.returnType !== 'saleable' : false)).length;

  const overReturn = (l: RLine) => l.sold !== undefined && n(l.qty) + n(l.freeQty) > l.sold - (l.already || 0);
  const overStock = (l: RLine) => l.avail !== undefined && n(l.qty) + n(l.freeQty) > l.avail;
  const overParty = (l: RLine) => l.partyReturnable !== undefined && n(l.qty) + n(l.freeQty) > l.partyReturnable;

  // ---- submit ----
  const submit = async () => {
    if (saving) return;
    if (!party) { enqueueSnackbar(`Choose the ${c.partyType}`, { variant: 'warning' }); return; }
    if (!active.length) { enqueueSnackbar('Enter the quantity to return on at least one line', { variant: 'warning' }); return; }
    const bad = active.find(overReturn);
    if (bad) { enqueueSnackbar(`${bad.productName} (${bad.batchNo}): only ${bad.sold! - (bad.already || 0)} left to return on this bill`, { variant: 'warning' }); return; }
    const body = {
      date, party: party._id, against: against?._id, reason, narration, adjustAgainstBill: !!against && adjust,
      items: active.map((l) => ({
        product: l.product, batch: l.batch, qty: n(l.qty), freeQty: n(l.freeQty), rate: n(l.rate), discountPct: n(l.discountPct),
        claimPct: l.claimPct === '' ? 100 : n(l.claimPct),
        ...(kind === 'sales' ? { returnType: l.returnType } : { stockBucket: l.stockBucket }),
      })),
    };
    setSaving(true);
    try {
      const r = await api.post(c.returnsUrl, body);
      setSaved(r.data.data);
      autoDraft.clear();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally { setSaving(false); }
  };
  useHotkey('ctrl+s', () => { submit(); }, [submit]);

  const newPath = kind === 'sales' ? '/sales-returns/new' : '/purchase-returns/new';
  const reset = () => {
    setSaved(null); setParty(null); setAgainst(null); setLines([]); setNarration(''); setReason(c.defaultReason); setDate(today());
    pickProduct(null);
    nav(newPath, { replace: true });
  };

  // ---- auto-save ----
  const applyReturnDraft = (d: ReturnDraft) => {
    setDate(d.date); setParty(d.party); setAgainst(d.against); setReason(d.reason); setAdjust(d.adjust); setNarration(d.narration);
    setLines(d.lines.map((l) => ({ ...l, key: nk() })));
    if (d.composer) setRestoreComposer(d.composer); else pickProduct(null);
  };
  const hasParams = !!(sp.get(kind === 'sales' ? 'invoice' : 'purchase') || sp.get('party'));
  const autoDraft = useDraft<ReturnDraft>({
    key: kind === 'sales' ? 'sales_return:new' : 'purchase_return:new',
    ready: draftReady,
    autoRestore: !hasParams,
    value: party || lines.length || prod || narration
      ? { date, party, against, reason, lines, adjust, narration, composer: prod ? { prod, draft, batchText } : null }
      : null,
    apply: applyReturnDraft,
    paused: !!saved,
  });
  const discardDraft = () => { autoDraft.clear(); reset(); };

  const billLabel = (b: Voucher) => `${b.number}${b.supplierInvoiceNo ? ` (${b.supplierInvoiceNo})` : ''} · ${fdate(b.date)} · ₹${amt(b.grandTotal)}${(b.balance || 0) > 0.009 ? ` · bal ₹${amt(b.balance)}` : ''}`;
  const billMode = !!against;

  return (
    <>
      <PageHeader
        help={['creditnote', 'debitnote', 'damaged', 'batch']}
        title={c.title}
        subtitle={c.subtitle}
        crumbs={[...c.crumbs, { label: 'New' }]}
        actions={
          <>
            <DraftStatus draft={autoDraft} />
            <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />} onClick={submit} disabled={saving}>Save (Ctrl+S)</Button>
          </>
        }
      />

      <DraftBanner draft={autoDraft} label={draftLabel} onDiscard={discardDraft} onOpen={() => { if (sp.toString()) nav(newPath, { replace: true }); }} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}>
            <PartyPicker type={c.partyType} value={party} onChange={changeParty} autoFocus={!party} required />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select label="Reason" value={reason} onChange={(e) => changeReason(e.target.value)} fullWidth>
              {c.reasons.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <Autocomplete
              options={bills}
              value={against}
              loading={billsLoading}
              disabled={!party}
              onChange={(_, v) => chooseBill(v)}
              isOptionEqualToValue={(a, b) => a._id === b._id}
              getOptionLabel={billLabel}
              renderInput={(p) => <TextField {...p} label={`Against ${c.billWord} (optional)`} placeholder={party ? 'Free entry — no bill' : 'Choose party first'} />}
            />
          </Grid>
        </Grid>
        {billMode && against && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography fontSize={13}>Bill total <b>₹{amt(against.grandTotal)}</b> · balance <b>₹{amt(against.balance)}</b></Typography>
            <FormControlLabel control={<Checkbox checked={adjust} onChange={(e) => setAdjust(e.target.checked)} disabled={(against.balance || 0) <= 0.009} />}
              label={`Adjust against bill ${against.number} (reduces its balance)`} />
          </Box>
        )}
        <Alert severity="info" sx={{ mt: 1.5 }} icon={false}>
          {kind === 'sales'
            ? <><b>Saleable</b> goes back into sellable stock. <b>Expiry & breakage go to damaged stock — never resold</b>; claim them from the company via Purchase Return (Debit Note). Claim % lets you credit only part of the value (e.g. company pays 80% on expiry).</>
            : <>Stock leaves the bucket you choose per line: <b>Damaged</b> (expiry / breakage returns from customers) or <b>Saleable</b> (expired stock still on the shelf, excess or wrong supply). Claim % = share of value the company accepts.</>}
          {reason === 'rate_difference' && <><br /><b>Rate difference:</b> enter the difference per unit as the rate. Quantities entered are treated as returned goods and move stock, so keep qty minimal (backend has no qty-less rate-difference note).</>}
        </Alert>
      </Paper>

      {/* Free-entry composer */}
      {!billMode && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} md={3}>
              <ProductPicker value={prod} onChange={pickProduct} inputRef={productRef} label="Product" />
            </Grid>
            <Grid item xs={12} sm={6} md={2.5}>
              {kind === 'sales' ? (
                <TextField label="Batch no." fullWidth value={batchText} inputRef={batchRef} disabled={!prod} onChange={(e) => onBatchText(e.target.value)}
                  error={!!batchText && !draft.batch && !batchesLoading}
                  helperText={batchesLoading ? 'Loading batches…' : !prod ? 'Pick a product first' : batchText && !draft.batch ? 'No unique match — click a row below' : draft.batch && sold[draft.batch] ? `Billed ${sold[draft.batch].lastBill}` : draft.batch ? 'Not sold to this party' : ' '}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.batch) qtyRef.current?.focus(); } }}
                  inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 0.5 } }} />
              ) : (
                <BatchSelect batches={batches} value={draft.batch} loading={batchesLoading} inputRef={batchRef} showDamaged
                  onChange={(id) => chooseBatch(batches.find((b) => b._id === id))} disabled={!prod} />
              )}
            </Grid>
            {[
              { k: 'qty', label: 'Qty', w: 1 }, { k: 'freeQty', label: 'Free', w: 1 }, { k: 'rate', label: 'Rate', w: 1.25 },
              { k: 'discountPct', label: 'Disc %', w: 1 }, { k: 'claimPct', label: 'Claim %', w: 1 },
            ].map((f) => (
              <Grid item xs={4} sm={2} md={f.w} key={f.k}>
                <TextField label={f.label} type="number" fullWidth value={draft[f.k as keyof typeof draft]} inputRef={f.k === 'qty' ? qtyRef : undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))} inputProps={{ min: 0, step: 'any' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} />
              </Grid>
            ))}
            <Grid item xs={8} sm={4} md={1.25}>
              <Button variant="contained" fullWidth startIcon={<AddIcon />} onClick={addDraft}>Add</Button>
            </Grid>
          </Grid>
          {kind === 'sales' && prod && !batchesLoading && (
            <Box sx={{ mt: 1.5 }}>
              <ReturnBatchStrip batches={batches} sold={sold} selectedId={draft.batch} onSelect={(b) => chooseBatch(b)}
                filter={batchText && !draft.batch ? batchText : undefined} />
            </Box>
          )}
          {kind === 'purchase' && (
            <Box sx={{ mt: 1.5 }}>
              <Button variant="outlined" startIcon={<Inventory2OutlinedIcon />} onClick={() => setLoaderOpen(true)} disabled={!party}>Load damaged / expired stock</Button>
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>Pick everything due for this supplier's expiry claim in one go.</Typography>
            </Box>
          )}
        </Paper>
      )}

      {billLoading && <LinearProgress sx={{ mb: 1 }} />}
      <Paper sx={{ overflow: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Batch</TableCell>
              <TableCell>Exp</TableCell>
              {billMode && <TableCell align="right">Billed</TableCell>}
              {billMode && <TableCell align="right">Returned</TableCell>}
              {kind === 'purchase' && !billMode && <TableCell align="right">In stock</TableCell>}
              <TableCell align="right" width={80}>Qty</TableCell>
              <TableCell align="right" width={70}>Free</TableCell>
              <TableCell align="right" width={95}>Rate</TableCell>
              <TableCell align="right" width={70}>Disc %</TableCell>
              <TableCell align="right" width={75}>Claim %</TableCell>
              <TableCell width={130}>{kind === 'sales' ? 'Return type' : 'Stock from'}</TableCell>
              <TableCell align="right">Amount</TableCell>
              {!billMode && <TableCell width={40} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((l, i) => {
              const calc = lineCalc(l);
              const err = overReturn(l) || overStock(l);
              return (
                <TableRow key={l.key} hover sx={{ bgcolor: n(l.qty) + n(l.freeQty) > 0 ? 'action.hover' : undefined }}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Typography fontSize={13} fontWeight={600}>{l.productName}</Typography>
                    <Typography fontSize={11} color="text.secondary">{[l.manufacturerName, l.packing, `GST ${l.gstRate}%`].filter(Boolean).join(' · ')}</Typography>
                  </TableCell>
                  <TableCell>
                    {l.batchNo}
                    {l.notSold && <Tooltip title="This batch was never billed to this party"><Chip label="not sold" color="warning" variant="outlined" sx={{ ml: 0.5, height: 16, fontSize: 10 }} /></Tooltip>}
                  </TableCell>
                  <TableCell><Typography fontSize={13} color={l.isExpired ? 'error.main' : undefined}>{fexp(l.expiry)}</Typography></TableCell>
                  {billMode && <TableCell align="right">{l.sold}</TableCell>}
                  {billMode && <TableCell align="right">{l.already || ''}</TableCell>}
                  {kind === 'purchase' && !billMode && <TableCell align="right">{l.avail ?? '—'}</TableCell>}
                  <TableCell align="right">
                    <Tooltip title={overReturn(l) ? `Max ${l.sold! - (l.already || 0)}` : overStock(l) ? `Only ${l.avail} in ${l.stockBucket} stock` : overParty(l) ? `Only ${l.partyReturnable} returnable from this party's bills` : ''}>
                      <span><Cell value={l.qty} onChange={(v) => upd(l.key, { qty: v })} error={err || overParty(l)} placeholder="0" /></span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right"><Cell value={l.freeQty} onChange={(v) => upd(l.key, { freeQty: v })} error={err} /></TableCell>
                  <TableCell align="right"><Cell value={l.rate} onChange={(v) => upd(l.key, { rate: v })} /></TableCell>
                  <TableCell align="right"><Cell value={l.discountPct} onChange={(v) => upd(l.key, { discountPct: v })} /></TableCell>
                  <TableCell align="right"><Cell value={l.claimPct} onChange={(v) => upd(l.key, { claimPct: v })} /></TableCell>
                  <TableCell>
                    {kind === 'sales' ? (
                      <TextField select variant="standard" value={l.returnType} onChange={(e) => upd(l.key, { returnType: e.target.value as RType })} fullWidth
                        SelectProps={{ sx: { fontSize: 13, color: l.returnType === 'saleable' ? 'success.main' : 'error.main' } }}>
                        <MenuItem value="saleable" disabled={l.isExpired}>Saleable</MenuItem>
                        <MenuItem value="expiry">Expiry → damaged</MenuItem>
                        <MenuItem value="breakage">Breakage → damaged</MenuItem>
                      </TextField>
                    ) : (
                      <TextField select variant="standard" value={l.stockBucket} onChange={(e) => upd(l.key, { stockBucket: e.target.value as Bucket })} fullWidth SelectProps={{ sx: { fontSize: 13 } }}>
                        <MenuItem value="damaged">Damaged</MenuItem>
                        <MenuItem value="saleable">Saleable</MenuItem>
                      </TextField>
                    )}
                  </TableCell>
                  <TableCell align="right"><b>{amt(calc.total)}</b></TableCell>
                  {!billMode && <TableCell><IconButton color="error" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>}
                </TableRow>
              );
            })}
            {!lines.length && (
              <TableRow><TableCell colSpan={15}><Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary">
                {!party ? `Choose the ${c.partyType} to start.` : billMode ? 'This bill has no lines.' : `Add items above${kind === 'purchase' ? ', or load damaged / expired stock' : ''} — or pick a bill to return against.`}
              </Typography></Box></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={7}>
          <TextField label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} fullWidth multiline minRows={2} />
          {kind === 'sales' && damagedCount > 0 && <Alert severity="warning" sx={{ mt: 1 }}>{damagedCount} line(s) go to damaged stock. Raise a Debit Note to the supplier/company to claim them.</Alert>}
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <TotRow label="Lines returning" value={String(active.length)} />
            <TotRow label="Taxable (approx.)" value={amt(totals.taxable)} />
            <TotRow label="GST (approx.)" value={amt(totals.tax)} />
            <TotRow label={kind === 'sales' ? 'Credit to party' : 'Debit to supplier'} value={`₹${amt(totals.total)}`} big />
            <Typography variant="caption" color="text.secondary">Final figures are computed on save (round-off, IGST vs CGST/SGST).</Typography>
          </Paper>
        </Grid>
      </Grid>

      {kind === 'purchase' && party && (
        <StockLoader open={loaderOpen} supplier={party} onClose={() => setLoaderOpen(false)}
          onAdd={(rows) => { setLines((ls) => [...ls, ...rows]); setLoaderOpen(false); }} existing={lines} />
      )}

      <ReturnSavedDialog kind={kind} doc={saved} onNew={reset} onList={() => nav(c.returnsUrl)} />
    </>
  );
}

const Cell: React.FC<{ value: string; onChange: (v: string) => void; error?: boolean; placeholder?: string }> = ({ value, onChange, error, placeholder }) => (
  <TextField variant="standard" type="number" value={value} onChange={(e) => onChange(e.target.value)} error={error} placeholder={placeholder}
    inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }} onFocus={(e) => e.target.select()} sx={{ width: '100%' }} />
);

// ---------- Purchase: load damaged / expired stock ----------
interface StockRow {
  _id: string; product: string; productName: string; manufacturerName: string; packing: string; batchNo: string; expiry: string;
  qty: number; damagedQty: number; supplier?: string; supplierName: string; landingCost: number;
}
interface PickRow { key: string; row: StockRow; bucket: Bucket; avail: number; take: string; sel: boolean }

function StockLoader({ open, supplier, onClose, onAdd, existing }: { open: boolean; supplier: PartyOption; onClose: () => void; onAdd: (l: RLine[]) => void; existing: RLine[] }) {
  const { enqueueSnackbar } = useSnackbar();
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    Promise.all([api.get('/reports/batch-stock', { params: { mode: 'damaged' } }), api.get('/reports/batch-stock', { params: { mode: 'expired' } })])
      .then(([d, e]) => {
        if (!alive) return;
        const taken = new Set(existing.map((l) => `${l.batch}:${l.stockBucket}`));
        const out: PickRow[] = [
          ...(d.data.data as StockRow[]).map((r) => ({ key: `${r._id}:damaged`, row: r, bucket: 'damaged' as Bucket, avail: r.damagedQty, take: String(r.damagedQty), sel: false })),
          ...(e.data.data as StockRow[]).map((r) => ({ key: `${r._id}:saleable`, row: r, bucket: 'saleable' as Bucket, avail: r.qty, take: String(r.qty), sel: false })),
        ].filter((r) => !taken.has(r.key));
        setRows(out);
        setShowAll(!out.some((r) => String(r.row.supplier) === supplier._id));
      })
      .catch((err) => enqueueSnackbar(errMsg(err), { variant: 'error' }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier._id]);

  const mine = rows.filter((r) => String(r.row.supplier) === supplier._id);
  const query = q.trim().toLowerCase();
  const visible = (showAll ? rows : mine).filter((r) => !query || `${r.row.productName} ${r.row.manufacturerName} ${r.row.batchNo}`.toLowerCase().includes(query));
  const selected = rows.filter((r) => r.sel && n(r.take) > 0);
  const set = (key: string, patch: Partial<PickRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const allSel = visible.length > 0 && visible.every((r) => r.sel);

  const add = async () => {
    setAdding(true);
    try {
      // Purchase rate + GST % per batch come from the product's batch list.
      const pids = [...new Set(selected.map((r) => String(r.row.product)))];
      const res = await Promise.all(pids.map((id) => api.get(`/products/${id}/batches`, { params: { all: 'true' } }).then((x) => x.data as { product: Product; data: Batch[] })));
      const pMap = new Map(res.map((x) => [String(x.product._id), x]));
      onAdd(selected.map((r) => {
        const info = pMap.get(String(r.row.product));
        const b = info?.data.find((x) => x._id === r.row._id);
        return {
          key: nk(), product: String(r.row.product), productName: r.row.productName, manufacturerName: r.row.manufacturerName, packing: r.row.packing,
          gstRate: info?.product.gstRate ?? 0, batch: r.row._id, batchNo: r.row.batchNo, expiry: r.row.expiry, isExpired: new Date(r.row.expiry) < new Date(),
          qty: r.take, freeQty: '', rate: String(b?.purchaseRate || r.row.landingCost || b?.ptr || 0), discountPct: '', claimPct: '100',
          returnType: 'expiry', stockBucket: r.bucket, avail: r.avail,
        };
      }));
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setAdding(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Damaged & expired stock<Typography variant="body2" color="text.secondary">Tick the batches to return to {supplier.name}. Damaged qty comes from the damaged bucket; expired-on-shelf from saleable.</Typography></DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
          <TextField placeholder="Filter product / company / batch" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 280 }} />
          <FormControlLabel control={<Switch checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />} label={`Show all suppliers (${rows.length})`} />
          <Typography variant="caption" color="text.secondary">From {supplier.name}: {mine.length} batch(es)</Typography>
        </Box>
        {!loading && !mine.length && rows.length > 0 && <Alert severity="info" sx={{ mb: 1 }}>No damaged/expired batch was bought from {supplier.name} — showing every supplier's.</Alert>}
        {loading && <LinearProgress />}
        <Paper variant="outlined" sx={{ maxHeight: '55vh', overflow: 'auto' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={allSel} indeterminate={!allSel && visible.some((r) => r.sel)} onChange={(e) => { const ks = new Set(visible.map((v) => v.key)); setRows((rs) => rs.map((r) => (ks.has(r.key) ? { ...r, sel: e.target.checked } : r))); }} /></TableCell>
                <TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell><TableCell>Bucket</TableCell>
                <TableCell>Bought from</TableCell><TableCell align="right">Available</TableCell><TableCell align="right" width={90}>Return qty</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.key} hover selected={r.sel}>
                  <TableCell padding="checkbox"><Checkbox checked={r.sel} onChange={(e) => set(r.key, { sel: e.target.checked })} /></TableCell>
                  <TableCell><Typography fontSize={13} fontWeight={600}>{r.row.productName}</Typography><Typography fontSize={11} color="text.secondary">{r.row.manufacturerName} · {r.row.packing}</Typography></TableCell>
                  <TableCell>{r.row.batchNo}</TableCell>
                  <TableCell>{fexp(r.row.expiry)}</TableCell>
                  <TableCell><Typography fontSize={12} color={r.bucket === 'damaged' ? 'error.main' : 'warning.main'} fontWeight={600}>{r.bucket === 'damaged' ? 'Damaged' : 'Expired (shelf)'}</Typography></TableCell>
                  <TableCell>{r.row.supplierName || '—'}</TableCell>
                  <TableCell align="right">{r.avail}</TableCell>
                  <TableCell align="right"><Cell value={r.take} onChange={(v) => set(r.key, { take: v, sel: true })} error={n(r.take) > r.avail} /></TableCell>
                </TableRow>
              ))}
              {!loading && !visible.length && <TableRow><TableCell colSpan={8}><Box sx={{ py: 4, textAlign: 'center' }}><Typography color="text.secondary">No damaged or expired stock{showAll ? '' : ' from this supplier'}.</Typography></Box></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ mr: 'auto', ml: 2 }} fontSize={13}>{selected.length} selected</Typography>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!selected.length || adding} onClick={add} startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>Add to debit note</Button>
      </DialogActions>
    </Dialog>
  );
}
