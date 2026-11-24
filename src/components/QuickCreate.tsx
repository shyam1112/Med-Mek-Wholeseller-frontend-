import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useSnackbar } from 'notistack';
import { api, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { round2 } from '../lib/format';
import { GST_RATES, STATES } from '../lib/types';
import { gstinIssue, NumField } from '../pages/masters/masterUi';
import { ManufacturerPicker, PartyOption, ProductOption } from './Pickers';

// Small "create without leaving the voucher" dialogs, opened from the
// "+ Create …" row of a picker. Only the fields needed to bill or order are
// asked; everything else can be filled later on the full master screen.

interface QuickProps<T> { open: boolean; initialName: string; onClose: () => void; onCreated: (v: T) => void }

export function QuickPartyDialog({ type, open, initialName, onClose, onCreated }: QuickProps<PartyOption> & { type: 'customer' | 'supplier' }) {
  const { business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const isCust = type === 'customer';
  const blank = () => ({
    name: initialName.trim(), mobile: '', gstin: '', gstType: 'regular', pan: '', stateCode: business?.stateCode || '', city: '',
    address: '', dl20b: '', dl21b: '', dlExpiry: '', creditDays: isCust ? business?.settings?.defaultCreditDays ?? 30 : 30,
  });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setF(blank()); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof ReturnType<typeof blank>, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const gstIssue = gstinIssue(f.gstin);
  const gstOk = f.gstin.length === 15 && !gstIssue;
  const onGstin = (raw: string) => {
    const g = raw.toUpperCase().replace(/\s/g, '').slice(0, 15);
    setF((x) => ({
      ...x, gstin: g,
      stateCode: g.length >= 2 && STATES[g.slice(0, 2)] ? g.slice(0, 2) : x.stateCode,
      pan: g.length >= 12 ? g.slice(2, 12) : x.pan,
      gstType: g ? 'regular' : x.gstType,
    }));
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) { setErr('Name is required.'); return; }
    if (gstIssue) { setErr(`GSTIN: ${gstIssue}`); return; }
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      const body = { ...f, name: f.name.trim(), gstType: f.gstin ? f.gstType : 'unregistered', dlExpiry: f.dlExpiry || null, type };
      const r = await api.post('/parties', body);
      const p = r.data.data;
      enqueueSnackbar(`${p.name} created.`, { variant: 'success' });
      onCreated({
        _id: p._id, name: p.name, city: p.city, area: p.area, gstin: p.gstin, stateCode: p.stateCode, mobile: p.mobile, balance: 0,
        creditLimit: p.creditLimit, creditDays: p.creditDays, dlExpiry: p.dlExpiry, isHold: false, cashDiscountPct: p.cashDiscountPct, group: p.group,
      });
    } catch (ex) {
      const m = errMsg(ex);
      setErr(/E11000|duplicate/i.test(m) ? `A ${type} named "${f.name}" already exists.` : m);
    } finally {
      setSaving(false);
    }
  };

  const interstate = f.stateCode && business?.stateCode && f.stateCode !== business.stateCode;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={save} noValidate>
        <DialogTitle>New {type}</DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Grid container spacing={1.5} sx={{ pt: 0.5 }}>
            <Grid item xs={12}><TextField label={`${isCust ? 'Customer' : 'Supplier'} name`} required autoFocus fullWidth value={f.name} onChange={(e) => set('name', e.target.value)} /></Grid>
            <Grid item xs={12} sm={7}>
              <TextField label="GSTIN" fullWidth value={f.gstin} onChange={(e) => onGstin(e.target.value)} error={!!gstIssue}
                helperText={gstIssue || (gstOk ? `${STATES[f.gstin.slice(0, 2)]} · PAN ${f.gstin.slice(2, 12)}` : 'Leave empty if unregistered')}
                inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1 } }}
                InputProps={{ endAdornment: f.gstin ? <InputAdornment position="end">{gstOk ? <CheckCircleIcon color="success" fontSize="small" /> : <ErrorOutlineIcon color="error" fontSize="small" />}</InputAdornment> : undefined }} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField label="Mobile" fullWidth value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/[^\d+]/g, '').slice(0, 13))} helperText="For WhatsApp" />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField select label="State" fullWidth value={f.stateCode} onChange={(e) => set('stateCode', e.target.value)} disabled={gstOk}
                helperText={interstate ? 'Inter-state — IGST will apply' : ' '}>
                <MenuItem value="">—</MenuItem>
                {Object.entries(STATES).map(([c, n]) => <MenuItem key={c} value={c}>{c} · {n}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={5}><TextField label="City" fullWidth value={f.city} onChange={(e) => set('city', e.target.value)} /></Grid>
            {isCust && <>
              <Grid item xs={6} sm={4}><TextField label="DL 20B" fullWidth value={f.dl20b} onChange={(e) => set('dl20b', e.target.value.toUpperCase())} /></Grid>
              <Grid item xs={6} sm={4}><TextField label="DL 21B" fullWidth value={f.dl21b} onChange={(e) => set('dl21b', e.target.value.toUpperCase())} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="DL valid till" type="date" fullWidth value={f.dlExpiry} onChange={(e) => set('dlExpiry', e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
            </>}
            <Grid item xs={6} sm={4}><NumField label="Credit days" value={f.creditDays} onChange={(v) => set('creditDays', Math.round(v))} /></Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Address, bank, {isCust ? 'rate type, route, credit limit ' : ''}and opening balance can be added later from the {type} page.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>Create</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const SCHEDULES = ['None', 'H', 'H1', 'X', 'G', 'Narcotic'];

export function QuickProductDialog({ open, initialName, onClose, onCreated }: QuickProps<ProductOption>) {
  const { enqueueSnackbar } = useSnackbar();
  const blank = () => ({
    name: initialName.trim().toUpperCase(), manufacturer: null as { _id: string; name: string } | null, packing: '', salt: '',
    hsn: '3004', gstRate: 5, schedule: 'None', mrp: 0, ptr: 0, pts: 0, purchaseRate: 0,
  });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setF(blank()); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((x) => ({ ...x, [k]: v }));

  // Standard trade structure, same as the full product form.
  const calcFromMrp = () => {
    if (!(f.mrp > 0)) return;
    const ptr = round2((f.mrp / (1 + f.gstRate / 100)) * 0.8);
    setF((x) => ({ ...x, ptr, pts: round2(ptr * 0.9) }));
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) { setErr('Product name is required.'); return; }
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      const r = await api.post('/products', { ...f, name: f.name.trim(), manufacturer: f.manufacturer?._id || '' });
      const p = r.data.data;
      enqueueSnackbar(`${p.name} created.`, { variant: 'success' });
      onCreated({
        _id: p._id, name: p.name, manufacturerName: p.manufacturerName || '', packing: p.packing, salt: p.salt, gstRate: p.gstRate, mrp: p.mrp,
        ptr: p.ptr, schedule: p.schedule, rack: p.rack, isBanned: false, stock: 0, nearestExpiry: null, schemeBuy: p.schemeBuy, schemeFree: p.schemeFree,
      });
    } catch (ex) {
      const m = errMsg(ex);
      setErr(/E11000|duplicate/i.test(m) ? `A product named "${f.name}" already exists.` : m);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={save} noValidate>
        <DialogTitle>New product</DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Grid container spacing={1.5} sx={{ pt: 0.5 }}>
            <Grid item xs={12} sm={8}><TextField label="Product name" required autoFocus fullWidth value={f.name} onChange={(e) => set('name', e.target.value)} helperText='As printed on the bill, e.g. "DOLO 650 TAB"' /></Grid>
            <Grid item xs={12} sm={4}><TextField label="Packing" fullWidth value={f.packing} onChange={(e) => set('packing', e.target.value)} placeholder="10 TAB" /></Grid>
            <Grid item xs={12} sm={6}><ManufacturerPicker value={f.manufacturer} onChange={(v) => set('manufacturer', v)} quickCreate /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Salt / composition" fullWidth value={f.salt} onChange={(e) => set('salt', e.target.value)} /></Grid>
            <Grid item xs={4}><TextField label="HSN" fullWidth value={f.hsn} onChange={(e) => set('hsn', e.target.value.replace(/\D/g, '').slice(0, 8))} /></Grid>
            <Grid item xs={4}>
              <TextField select label="GST" fullWidth value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>
                {GST_RATES.map((r) => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={4}>
              <TextField select label="Schedule" fullWidth value={f.schedule} onChange={(e) => set('schedule', e.target.value)}>
                {SCHEDULES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}><NumField label="MRP" value={f.mrp} onChange={(v) => set('mrp', v)} onBlur={() => { if (!f.ptr) calcFromMrp(); }} /></Grid>
            <Grid item xs={6} sm={3}><NumField label="PTR" value={f.ptr} onChange={(v) => set('ptr', v)} /></Grid>
            <Grid item xs={6} sm={3}><NumField label="PTS" value={f.pts} onChange={(v) => set('pts', v)} /></Grid>
            <Grid item xs={6} sm={3}><NumField label="Purchase rate" value={f.purchaseRate} onChange={(v) => set('purchaseRate', v)} /></Grid>
          </Grid>
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              PTR/PTS fill from MRP (MRP ex-GST less 20%, then less 10%) — change them if your company's rates differ. Rack, barcode and reorder levels can be set later on the product page.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>Create</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
