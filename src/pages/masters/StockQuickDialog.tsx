import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { amt, fexp, num, parseExpiry, today } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import type { Batch, Product } from '../../lib/types';
import { AdjustReason, reasonOf } from '../inventory/adjustReasons';

// Stock in / out for one product, straight from its page — a one-line
// stock adjustment (same voucher, numbering and audit as the full screen).

export type QuickMode = 'in' | 'out' | 'damage' | 'destroy';

const MODES: { v: QuickMode; label: string; reasons: AdjustReason[] }[] = [
  { v: 'in', label: 'Stock in', reasons: ['excess', 'opening'] },
  { v: 'out', label: 'Stock out', reasons: ['shortage', 'sample'] },
  { v: 'damage', label: 'Move to damaged', reasons: ['damage', 'expired_to_damaged'] },
  { v: 'destroy', label: 'Destroy damaged', reasons: ['destroyed'] },
];

const NEW = 'new';
const free = (b: Batch) => Math.max(0, b.qty - (b.reservedQty || 0));

export default function StockQuickDialog({ open, product, batches, initialBatch, initialMode = 'in', onClose, onSaved }: {
  open: boolean;
  product: Product;
  batches: Batch[];
  initialBatch?: Batch | null;
  initialMode?: QuickMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [mode, setMode] = useState<QuickMode>(initialMode);
  const [reason, setReason] = useState<AdjustReason>('excess');
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  const [nb, setNb] = useState({ batchNo: '', exp: '', mrp: '', ptr: '', purchaseRate: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Batches that make sense for the chosen action.
  const eligible = (m: QuickMode) => batches.filter((b) => (m === 'in' ? true : m === 'destroy' ? b.damagedQty > 0 : b.qty > 0));

  const pickDefaultBatch = (m: QuickMode, pref?: Batch | null) => {
    const list = eligible(m);
    if (pref && list.some((b) => b._id === pref._id)) return pref._id;
    if (m === 'in') return list.find((b) => b.qty > 0)?._id || NEW;
    if (m === 'damage') return (list.find((b) => b.isExpired) || list[0])?._id || '';
    return list[0]?._id || '';
  };

  useEffect(() => {
    if (!open) return;
    const m = initialMode;
    setMode(m);
    setReason(MODES.find((x) => x.v === m)!.reasons[0]);
    setBatchId(pickDefaultBatch(m, initialBatch));
    setQty(''); setNarration(''); setErr(''); setDate(today());
    setNb({ batchNo: '', exp: '', mrp: product.mrp ? String(product.mrp) : '', ptr: product.ptr ? String(product.ptr) : '', purchaseRate: product.purchaseRate ? String(product.purchaseRate) : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeMode = (m: QuickMode) => {
    setMode(m);
    const r = MODES.find((x) => x.v === m)!.reasons[0];
    setReason(m === 'damage' && batches.find((b) => b._id === batchId)?.isExpired ? 'expired_to_damaged' : r);
    setBatchId(pickDefaultBatch(m, batches.find((b) => b._id === batchId)));
    setErr('');
  };

  const b = batches.find((x) => x._id === batchId);
  const q = Number(qty) || 0;
  // Saleable can only lose its unreserved part (server enforces the same).
  const maxOut = mode === 'destroy' ? b?.damagedQty ?? 0 : b ? free(b) : 0;
  const isNew = mode === 'in' && batchId === NEW;

  const preview = () => {
    if (!q) return null;
    if (isNew) return `New batch ${nb.batchNo.toUpperCase() || '…'}: saleable 0 → ${num(q)}`;
    if (!b) return null;
    if (mode === 'in') return `${b.batchNo}: saleable ${num(b.qty)} → ${num(b.qty + q)}`;
    if (mode === 'out') return `${b.batchNo}: saleable ${num(b.qty)} → ${num(b.qty - q)}`;
    if (mode === 'damage') return `${b.batchNo}: saleable ${num(b.qty)} → ${num(b.qty - q)}, damaged ${num(b.damagedQty)} → ${num(b.damagedQty + q)}`;
    return `${b.batchNo}: damaged ${num(b.damagedQty)} → ${num(b.damagedQty - q)}`;
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (!(q > 0)) { setErr('Enter a quantity.'); return; }
    let item: Record<string, unknown>;
    if (isNew) {
      const expiry = parseExpiry(nb.exp);
      if (!nb.batchNo.trim()) { setErr('Enter the batch number.'); return; }
      if (!expiry) { setErr('Enter expiry as MM/YY, e.g. 08/27.'); return; }
      if (!(Number(nb.mrp) > 0)) { setErr('Enter the MRP of this batch.'); return; }
      item = { product: product._id, batchNo: nb.batchNo.trim().toUpperCase(), expiry, mrp: Number(nb.mrp), ptr: Number(nb.ptr) || undefined, purchaseRate: Number(nb.purchaseRate) || undefined, qty: q };
    } else {
      if (!b) { setErr('Choose the batch.'); return; }
      if (mode !== 'in' && q > maxOut) {
        setErr(mode === 'destroy' ? `Only ${maxOut} damaged in ${b.batchNo}.` : `Only ${maxOut} free in ${b.batchNo}${b.reservedQty ? ` (${b.reservedQty} reserved for sales orders)` : ''}.`);
        return;
      }
      item = { product: product._id, batch: b._id, qty: q };
    }
    setSaving(true); setErr('');
    try {
      const r = await api.post('/stock-adjustments', { date, reason, narration, items: [item] });
      enqueueSnackbar(`${r.data.data.number} saved — ${preview()}`, { variant: 'success' });
      onSaved();
      onClose();
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setSaving(false);
    }
  };

  const list = eligible(mode);
  const reasons = MODES.find((x) => x.v === mode)!.reasons;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={save} noValidate>
        <DialogTitle sx={{ pb: 1 }}>
          Adjust stock — {product.name}
          <Typography fontSize={12} color="text.secondary">{[product.packing, product.manufacturerName].filter(Boolean).join(' · ')}</Typography>
        </DialogTitle>
        <DialogContent>
          <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, v) => v && changeMode(v)} sx={{ mb: 2, '& .MuiToggleButton-root': { fontSize: 12 } }}>
            {MODES.map((m) => (
              <ToggleButton key={m.v} value={m.v} color={m.v === 'in' ? 'success' : m.v === 'out' || m.v === 'destroy' ? 'error' : 'warning'}>{m.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={reasons.length > 1 ? 6 : 12}>
              <TextField select label="Batch" fullWidth value={batchId} onChange={(e) => setBatchId(e.target.value)}
                helperText={!list.length && mode !== 'in' ? (mode === 'destroy' ? 'No damaged stock' : 'No stock to take out') : ' '}>
                {mode === 'in' && <MenuItem value={NEW}><b>+ New batch</b></MenuItem>}
                {list.map((x) => (
                  <MenuItem key={x._id} value={x._id}>
                    <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'baseline' }}>
                      <b>{x.batchNo}</b>
                      <Typography component="span" fontSize={12} color={x.isExpired ? 'error.main' : 'text.secondary'}>Exp {fexp(x.expiry)} · MRP {amt(x.mrp)}</Typography>
                      <Typography component="span" fontSize={12} sx={{ ml: 'auto' }}>
                        {mode === 'destroy' ? `${num(x.damagedQty)} damaged` : `${num(x.qty)} in stock${x.reservedQty ? ` (${x.reservedQty} res.)` : ''}`}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {reasons.length > 1 && (
              <Grid item xs={12} sm={6}>
                <TextField select label="Reason" fullWidth value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)} helperText=" ">
                  {reasons.map((r) => <MenuItem key={r} value={r}>{reasonOf(r)?.label}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            {isNew && <>
              <Grid item xs={6} sm={4}><TextField label="Batch no." required fullWidth autoFocus value={nb.batchNo} onChange={(e) => setNb({ ...nb, batchNo: e.target.value.toUpperCase() })} /></Grid>
              <Grid item xs={6} sm={2}><TextField label="Expiry" required fullWidth placeholder="MM/YY" value={nb.exp} onChange={(e) => setNb({ ...nb, exp: e.target.value })} /></Grid>
              <Grid item xs={4} sm={2}><TextField label="MRP" required type="number" fullWidth value={nb.mrp} onChange={(e) => setNb({ ...nb, mrp: e.target.value })} /></Grid>
              <Grid item xs={4} sm={2}><TextField label="PTR" type="number" fullWidth value={nb.ptr} onChange={(e) => setNb({ ...nb, ptr: e.target.value })} /></Grid>
              <Grid item xs={4} sm={2}><TextField label="Cost" type="number" fullWidth value={nb.purchaseRate} onChange={(e) => setNb({ ...nb, purchaseRate: e.target.value })} helperText="Purchase rate" /></Grid>
            </>}
            <Grid item xs={6} sm={4}>
              <TextField label="Qty" type="number" required fullWidth autoFocus={!isNew} value={qty} onChange={(e) => setQty(e.target.value)}
                inputProps={{ min: 1, inputMode: 'numeric' }} error={!isNew && mode !== 'in' && q > maxOut}
                helperText={!isNew && b && mode !== 'in' ? `Max ${num(maxOut)}${mode !== 'destroy' && b.reservedQty ? ` · ${b.reservedQty} reserved` : ''}` : ' '} />
            </Grid>
            <Grid item xs={6} sm={3}><TextField label="Date" type="date" fullWidth value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={5}><TextField label="Note" fullWidth value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Physical count, sample to Dr…" /></Grid>
          </Grid>
          <Typography fontSize={12} color="text.secondary" sx={{ mt: 1 }}>{reasonOf(reason)?.effect}</Typography>
          {preview() && <Alert severity={mode === 'in' ? 'success' : 'warning'} icon={false} sx={{ mt: 1, py: 0 }}>{preview()}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color={mode === 'in' ? 'success' : mode === 'damage' ? 'warning' : 'error'} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {MODES.find((m) => m.v === mode)!.label}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
