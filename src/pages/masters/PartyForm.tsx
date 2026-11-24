import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, FormControlLabel, Grid, InputAdornment, LinearProgress, MenuItem, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { RoutePicker } from '../../components/Pickers';
import { useHotkey } from '../../lib/hooks';
import { isoDate } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { STATES } from '../../lib/types';
import type { Party } from '../../lib/types';
import { DlChip, NumField, Section, gstinIssue, refId, useUsers } from './masterUi';

type RouteOpt = { _id: string; name: string; areas?: string[]; salesman?: { _id: string } | string | null };

type Form = Omit<Party, '_id' | 'route' | 'salesman' | 'group' | 'balance' | 'dlExpiry'> & { route: RouteOpt | null; salesman: string; dlExpiry: string };

const RATE_TYPES: { v: Party['rateType']; label: string; help: string }[] = [
  { v: 'ptr', label: 'PTR', help: 'Bill at the batch PTR — standard for retail chemists.' },
  { v: 'pts', label: 'PTS', help: 'Bill at the batch PTS — for sub-stockists.' },
  { v: 'mrp', label: 'MRP', help: 'Bill at the batch MRP (taken ex-GST, since the bill rate is before tax).' },
  { v: 'mrp_less', label: 'MRP less %', help: 'MRP (ex-GST) minus the % below — hospitals, institutions, nursing homes.' },
  { v: 'ptr_plus', label: 'PTR plus %', help: 'PTR plus the % below — small-volume or far-route parties.' },
];
const GST_TYPES = [
  { v: 'regular', label: 'Regular' }, { v: 'composition', label: 'Composition' }, { v: 'unregistered', label: 'Unregistered' },
  { v: 'consumer', label: 'Consumer' }, { v: 'sez', label: 'SEZ' },
];

export default function PartyForm() {
  const { id } = useParams();
  const editing = !!id;
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const salesmen = useUsers('salesman');
  const [type, setType] = useState<'customer' | 'supplier'>(sp.get('type') === 'supplier' ? 'supplier' : 'customer');
  const isCust = type === 'customer';
  const s = business?.settings;

  const blank = (t: 'customer' | 'supplier'): Form => ({
    name: '', code: '', gstin: '', gstType: 'regular', pan: '', stateCode: business?.stateCode || '', address: '', city: '', pincode: '',
    phone: '', mobile: '', email: '', contactPerson: '', dl20b: '', dl21b: '', dlExpiry: '', creditLimit: 0,
    creditDays: t === 'customer' ? s?.defaultCreditDays ?? 30 : 30, rateType: (s?.defaultRateType as Party['rateType']) || 'ptr', rateAdjustPct: 0,
    extraDiscountPct: 0, cashDiscountPct: 0, minExpiryDays: 0, route: null, area: '', salesman: '', isHold: false, holdReason: '',
    openingBalance: 0, openingType: t === 'customer' ? 'dr' : 'cr', notes: '', isActive: true, bankAccountNo: '', ifsc: '',
  } as Form);

  const [f, setF] = useState<Form>(() => blank(type));
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverErr, setServerErr] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get(`/parties/${id}`)
      .then((r) => {
        const p = r.data.data as Party;
        setType(p.group === 'sundry_creditors' ? 'supplier' : 'customer');
        setF({
          ...blank(p.group === 'sundry_creditors' ? 'supplier' : 'customer'), ...p,
          route: p.route && typeof p.route === 'object' ? (p.route as RouteOpt) : null,
          salesman: refId(p.salesman), dlExpiry: isoDate(p.dlExpiry),
        } as Form);
        setLoaded(true);
      })
      .catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const gstIssue = gstinIssue(f.gstin);
  const gstOk = f.gstin.length === 15 && !gstIssue;
  const onGstin = (raw: string) => {
    const g = raw.toUpperCase().replace(/\s/g, '').slice(0, 15);
    setServerErr('');
    setF((x) => {
      const next = { ...x, gstin: g };
      if (g.length >= 2 && STATES[g.slice(0, 2)]) next.stateCode = g.slice(0, 2);
      if (g.length >= 12 && (!x.pan || x.pan === x.gstin.slice(2, 12))) next.pan = g.slice(2, 12);
      if (g && (x.gstType === 'unregistered' || x.gstType === 'consumer')) next.gstType = 'regular';
      return next;
    });
  };

  const onRoute = (v: RouteOpt | null) => {
    setF((x) => ({ ...x, route: v, salesman: x.salesman || refId(v?.salesman) }));
  };

  const nameErr = touched && !f.name.trim();
  const rateHelp = RATE_TYPES.find((r) => r.v === f.rateType)?.help;
  const needsAdj = f.rateType === 'mrp_less' || f.rateType === 'ptr_plus';

  const save = async () => {
    setTouched(true);
    if (!f.name.trim()) { enqueueSnackbar('Party name is required.', { variant: 'warning' }); return; }
    if (gstIssue) { enqueueSnackbar(`GSTIN: ${gstIssue}`, { variant: 'warning' }); return; }
    if (f.isHold && !f.holdReason.trim()) { enqueueSnackbar('Give a reason for the hold so billing staff know why.', { variant: 'warning' }); return; }
    if (saving) return;
    setSaving(true);
    setServerErr('');
    try {
      const body: Record<string, unknown> = {
        ...f,
        name: f.name.trim(),
        route: f.route?._id || '',
        salesman: f.salesman || '',
        dlExpiry: f.dlExpiry || null,
        rateAdjustPct: needsAdj ? f.rateAdjustPct : 0,
      };
      for (const k of ['_id', 'group', 'balance', 'business', 'createdAt', 'updatedAt', '__v', 'systemKey']) delete body[k];
      const r = editing ? await api.put(`/parties/${id}`, body) : await api.post('/parties', { ...body, type });
      enqueueSnackbar(`${r.data.data.name} saved.`, { variant: 'success' });
      nav(`/parties/${r.data.data._id}`, { replace: true });
    } catch (e) {
      const m = errMsg(e);
      setServerErr(/E11000|duplicate/i.test(m) ? `A ${type} named "${f.name}" already exists.` : m);
      enqueueSnackbar(m, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useHotkey('ctrl+s', save, [f]);
  useHotkey('f2', save, [f]);

  const label = isCust ? 'Customer' : 'Supplier';
  const cancel = () => nav(editing ? `/parties/${id}` : isCust ? '/customers' : '/suppliers');

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        help={['gstin', 'dl', 'creditdays', 'creditlimit', 'cd', 'shelflife', 'route']}
        title={editing ? `Edit ${f.name || label.toLowerCase()}` : `New ${label}`}
        crumbs={[{ label: 'Masters' }, { label: isCust ? 'Customers' : 'Suppliers', to: isCust ? '/customers' : '/suppliers' }, ...(editing ? [{ label: f.name || '…', to: `/parties/${id}` }] : [])]}
        subtitle="Ctrl+S / F2 to save"
        actions={
          <>
            {!editing && (
              <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v) => { if (v) { setType(v); setF((x) => ({ ...x, openingType: v === 'customer' ? 'dr' : 'cr' })); } }}>
                <ToggleButton value="customer">Customer</ToggleButton>
                <ToggleButton value="supplier">Supplier</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
          </>
        }
      />
      {!loaded && <LinearProgress sx={{ mb: 2 }} />}
      {serverErr && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setServerErr('')}>{serverErr}</Alert>}

      <Section title="Basic">
        <Grid item xs={12} md={6}>
          <TextField label={`${label} name`} required autoFocus fullWidth value={f.name} onChange={(e) => set('name', e.target.value)} error={nameErr} helperText={nameErr ? 'Required' : isCust ? 'Firm name as on the drug licence' : ' '} />
        </Grid>
        <Grid item xs={6} md={2}><TextField label="Code" fullWidth value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} helperText="For quick lookup" /></Grid>
        <Grid item xs={6} md={4}><TextField label="Contact person" fullWidth value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField label="Mobile (WhatsApp)" fullWidth value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/[^\d+]/g, '').slice(0, 13))}
            error={!!f.mobile && f.mobile.replace(/\D/g, '').length < 10} helperText={f.mobile && f.mobile.replace(/\D/g, '').length < 10 ? '10 digits' : 'Used for bill & reminder sharing'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}><TextField label="Phone" fullWidth value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Grid>
        <Grid item xs={12} md={6}><TextField label="Email" type="email" fullWidth value={f.email} onChange={(e) => set('email', e.target.value.trim())} /></Grid>
        <Grid item xs={12}><TextField label="Address" fullWidth multiline minRows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Grid>
        <Grid item xs={12} sm={4}><TextField label="City" fullWidth value={f.city} onChange={(e) => set('city', e.target.value)} /></Grid>
        <Grid item xs={6} sm={3}><TextField label="Pincode" fullWidth value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></Grid>
        <Grid item xs={6} sm={5}>
          <TextField select label="State" fullWidth value={f.stateCode} onChange={(e) => set('stateCode', e.target.value)} disabled={gstOk}
            helperText={gstOk ? 'From GSTIN' : f.stateCode && business?.stateCode && f.stateCode !== business.stateCode ? 'Inter-state — IGST will apply' : 'Decides CGST+SGST vs IGST'}>
            <MenuItem value="">—</MenuItem>
            {Object.entries(STATES).map(([c, n]) => <MenuItem key={c} value={c}>{c} · {n}</MenuItem>)}
          </TextField>
        </Grid>
      </Section>

      <Section title="GST">
        <Grid item xs={12} sm={4}>
          <TextField select label="GST type" fullWidth value={f.gstType} onChange={(e) => set('gstType', e.target.value)}>
            {GST_TYPES.map((g) => <MenuItem key={g.v} value={g.v}>{g.label}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={5}>
          <TextField label="GSTIN" fullWidth value={f.gstin} onChange={(e) => onGstin(e.target.value)} error={!!gstIssue}
            helperText={gstIssue || (gstOk ? `${STATES[f.gstin.slice(0, 2)]} · PAN ${f.gstin.slice(2, 12)}` : f.gstType === 'regular' || f.gstType === 'composition' ? 'B2B invoice needs a GSTIN' : ' ')}
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1 } }}
            InputProps={{ endAdornment: f.gstin ? <InputAdornment position="end">{gstOk ? <CheckCircleIcon color="success" fontSize="small" /> : <ErrorOutlineIcon color="error" fontSize="small" />}</InputAdornment> : undefined }} />
        </Grid>
        <Grid item xs={12} sm={3}><TextField label="PAN" fullWidth value={f.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().slice(0, 10))} /></Grid>
      </Section>

      {isCust && (
        <Section title="Drug licence" hint={business?.settings?.dlExpiryAction === 'block' ? 'Billing is blocked when the DL has expired' : business?.settings?.dlExpiryAction === 'warn' ? 'Billing warns when the DL has expired' : undefined}>
          <Grid item xs={12} sm={4}><TextField label="Drug licence 1 (Form 20 / 20B)" fullWidth value={f.dl20b} onChange={(e) => set('dl20b', e.target.value.toUpperCase())} /></Grid>
          <Grid item xs={12} sm={4}><TextField label="Drug licence 2 (Form 21 / 21B)" fullWidth value={f.dl21b} onChange={(e) => set('dl21b', e.target.value.toUpperCase())} /></Grid>
          <Grid item xs={12} sm={4}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField label="DL valid till" type="date" fullWidth value={f.dlExpiry} onChange={(e) => set('dlExpiry', e.target.value)} InputLabelProps={{ shrink: true }} />
              <DlChip expiry={f.dlExpiry || null} />
            </Box>
          </Grid>
        </Section>
      )}

      <Section title={isCust ? 'Credit & pricing' : 'Credit terms'}>
        <Grid item xs={6} sm={3}><NumField label="Credit limit" value={f.creditLimit} onChange={(v) => set('creditLimit', v)} helperText="0 = no limit" InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} /></Grid>
        <Grid item xs={6} sm={3}><NumField label="Credit days" value={f.creditDays} onChange={(v) => set('creditDays', Math.round(v))} helperText="Bill due date = bill date + days" /></Grid>
        {isCust && <>
          <Grid item xs={6} sm={3}><NumField label="Extra discount" suffix="%" value={f.extraDiscountPct} onChange={(v) => set('extraDiscountPct', Math.min(100, v))} helperText="Trade discount on every line" /></Grid>
          <Grid item xs={6} sm={3}><NumField label="Cash discount (CD)" suffix="%" value={f.cashDiscountPct} onChange={(v) => set('cashDiscountPct', Math.min(100, v))} helperText="Bill-level, on prompt payment" /></Grid>
          <Grid item xs={6} sm={3}>
            <NumField label="Min. shelf life" suffix="days" value={f.minExpiryDays ?? 0} onChange={(v) => set('minExpiryDays', Math.round(v))}
              helperText={f.minExpiryDays ? 'FEFO skips batches expiring sooner' : `0 = business default (${s?.minExpiryDaysForSale ?? 90} days)`} />
          </Grid>
          <Grid item xs={12} sm={needsAdj ? 5 : 6}>
            <TextField select label="Rate type" fullWidth value={f.rateType} onChange={(e) => set('rateType', e.target.value as Party['rateType'])} helperText={rateHelp}>
              {RATE_TYPES.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}
            </TextField>
          </Grid>
          {needsAdj && (
            <Grid item xs={12} sm={3}>
              <NumField label={f.rateType === 'mrp_less' ? 'Less on MRP' : 'Add on PTR'} suffix="%" value={f.rateAdjustPct} onChange={(v) => set('rateAdjustPct', v)}
                helperText={f.rateType === 'mrp_less' ? `MRP ₹112 at 12% GST → rate ₹${(100 * (1 - f.rateAdjustPct / 100)).toFixed(2)}` : `PTR ₹100 → rate ₹${(100 + f.rateAdjustPct).toFixed(2)}`} />
            </Grid>
          )}
          <Grid item xs={12} sm={needsAdj ? 4 : 6}>
            <Typography variant="caption" color="text.secondary">Product-specific deals go in Special Rates (on the party page) and override the rate type for that product.</Typography>
          </Grid>
        </>}
      </Section>

      {isCust && (
        <Section title="Assignment">
          <Grid item xs={12} sm={4}><RoutePicker value={f.route} onChange={(v) => onRoute(v as RouteOpt | null)} /></Grid>
          <Grid item xs={12} sm={4}>
            <Autocomplete freeSolo options={f.route?.areas || []} value={f.area} onInputChange={(_, v) => set('area', v)} renderInput={(p) => <TextField {...p} label="Area" />} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField select label="Salesman" fullWidth value={salesmen.some((u) => u._id === f.salesman) ? f.salesman : ''} onChange={(e) => set('salesman', e.target.value)}
              helperText={salesmen.length ? 'Salesman sees only their parties' : 'No users with the salesman role yet'}>
              <MenuItem value="">— None —</MenuItem>
              {salesmen.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
            </TextField>
          </Grid>
        </Section>
      )}

      {!isCust && (
        <Section title="Bank (for payments)">
          <Grid item xs={12} sm={6}><TextField label="Bank account no." fullWidth value={f.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value.replace(/\s/g, ''))} /></Grid>
          <Grid item xs={12} sm={6}><TextField label="IFSC" fullWidth value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase().slice(0, 11))} /></Grid>
        </Section>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Section title="Opening balance" hint="Balance carried from your old books">
            <Grid item xs={7}><NumField label="Amount" value={f.openingBalance} onChange={(v) => set('openingBalance', v)} InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} /></Grid>
            <Grid item xs={5}>
              <ToggleButtonGroup exclusive fullWidth size="small" value={f.openingType} onChange={(_, v) => v && set('openingType', v)}>
                <ToggleButton value="dr">Dr</ToggleButton>
                <ToggleButton value="cr">Cr</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">{f.openingType === 'dr' ? (isCust ? 'Customer owes you' : 'Advance paid to supplier') : isCust ? 'Advance from customer' : 'You owe the supplier'}</Typography>
            </Grid>
          </Section>
        </Grid>
        <Grid item xs={12} md={6}>
          <Section title="Hold">
            <Grid item xs={12} sm={4}><FormControlLabel control={<Switch color="error" checked={f.isHold} onChange={(e) => set('isHold', e.target.checked)} />} label={f.isHold ? 'On hold' : 'Not on hold'} /></Grid>
            <Grid item xs={12} sm={8}>
              <TextField label="Hold reason" fullWidth value={f.holdReason} onChange={(e) => set('holdReason', e.target.value)} disabled={!f.isHold} required={f.isHold}
                helperText={f.isHold ? 'Billing is stopped for this party' : 'Stop billing (cheque bounce, dispute…)'} />
            </Grid>
          </Section>
        </Grid>
      </Grid>

      <Section title="Notes">
        <Grid item xs={12}><TextField fullWidth multiline minRows={2} placeholder="Delivery instructions, timings, anything the team should know" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Grid>
      </Section>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <FormControlLabel control={<Switch checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />} label={f.isActive ? 'Active' : 'Inactive — hidden from pickers'} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
      </Box>
    </Box>
  );
}
