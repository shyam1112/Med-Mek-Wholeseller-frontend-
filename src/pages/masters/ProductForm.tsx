import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, Grid, LinearProgress, MenuItem, Switch, TextField, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { ManufacturerPicker } from '../../components/Pickers';
import { useFetch, useHotkey } from '../../lib/hooks';
import { round2 } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { GST_RATES } from '../../lib/types';
import type { Product } from '../../lib/types';
import { NumField, Section } from './masterUi';

const SCHEDULES: { v: string; label: string; help: string }[] = [
  { v: 'None', label: 'None', help: 'OTC / general' },
  { v: 'H', label: 'Schedule H', help: 'Prescription only' },
  { v: 'H1', label: 'Schedule H1', help: 'Goes to the H1 register (party, DL, batch, qty)' },
  { v: 'X', label: 'Schedule X', help: 'Narcotic/psychotropic — strict records' },
  { v: 'G', label: 'Schedule G', help: 'Under medical supervision' },
  { v: 'Narcotic', label: 'Narcotic (NDPS)', help: 'NDPS register' },
];
const DEFAULT_UNITS = ['Strip', 'Box', 'Bottle', 'Vial', 'Ampoule', 'Tube', 'Jar', 'Sachet', 'Piece', 'Pack', 'Kit'];

type Form = Omit<Product, '_id' | 'manufacturer'> & { manufacturer: { _id: string; name: string } | null };

const BLANK: Form = {
  name: '', code: '', manufacturer: null, manufacturerName: '', division: '', salt: '', form: 'Tablet', category: 'Ethical',
  hsn: '3004', gstRate: 5, packing: '', unit: 'Strip', unitsPerBox: 1, schedule: 'None', coldChain: false, isBanned: false,
  rack: '', barcode: '', minStock: 0, reorderLevel: 0, reorderQty: 0, maxStock: 0, schemeBuy: 0, schemeFree: 0,
  defaultDiscountPct: 0, mrp: 0, ptr: 0, pts: 0, purchaseRate: 0, isActive: true,
};

export default function ProductForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [f, setF] = useState<Form>(BLANK);
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [divisions, setDivisions] = useState<string[]>([]);
  const { data: filters } = useFetch<{ forms: string[]; categories: string[]; units: string[] }>('/products/filters');

  useEffect(() => {
    if (!id) return;
    api.get(`/products/${id}`)
      .then((r) => {
        const p = r.data.data as Product;
        setF({ ...BLANK, ...p, manufacturer: p.manufacturer ? { _id: String(p.manufacturer), name: p.manufacturerName } : null });
        setLoaded(true);
      })
      .catch((e) => enqueueSnackbar(errMsg(e), { variant: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Divisions of the chosen company, offered as suggestions.
  useEffect(() => {
    if (!f.manufacturer?._id) { setDivisions([]); return; }
    api.get(`/manufacturers/${f.manufacturer._id}`).then((r) => setDivisions(r.data.data?.divisions || [])).catch(() => setDivisions([]));
  }, [f.manufacturer?._id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const nameErr = touched && !f.name.trim();
  const priceWarn: string[] = [];
  if (f.mrp > 0 && f.ptr > f.mrp) priceWarn.push('PTR is higher than MRP.');
  if (f.ptr > 0 && f.pts > f.ptr) priceWarn.push('PTS is higher than PTR.');
  if (f.ptr > 0 && f.purchaseRate > f.ptr) priceWarn.push('Purchase rate is higher than PTR — you will sell at a loss.');
  const mrpExGst = f.mrp / (1 + f.gstRate / 100);
  const retailerMargin = f.mrp > 0 && f.ptr > 0 ? ((mrpExGst - f.ptr) / mrpExGst) * 100 : null;
  const ourMargin = f.ptr > 0 && f.purchaseRate > 0 ? ((f.ptr - f.purchaseRate) / f.ptr) * 100 : null;

  // Standard trade structure: PTR = MRP ex-GST less 20%, PTS = PTR less 10%.
  const calcFromMrp = () => {
    if (!(f.mrp > 0)) { enqueueSnackbar('Enter MRP first.', { variant: 'info' }); return; }
    const ptr = round2(mrpExGst * 0.8);
    setF((s) => ({ ...s, ptr, pts: round2(ptr * 0.9) }));
  };

  const save = async (andNew = false) => {
    setTouched(true);
    if (!f.name.trim()) { enqueueSnackbar('Product name is required.', { variant: 'warning' }); return; }
    if (saving) return;
    setSaving(true);
    try {
      const { manufacturer, manufacturerName: _mn, stock: _s, damaged: _d, stockValue: _sv, nearestExpiry: _ne, ...rest } = f;
      void _mn; void _s; void _d; void _sv; void _ne;
      const body = { ...rest, name: f.name.trim(), manufacturer: manufacturer?._id || '' };
      const r = editing ? await api.put(`/products/${id}`, body) : await api.post('/products', body);
      enqueueSnackbar(`${r.data.data.name} saved.`, { variant: 'success' });
      if (andNew) {
        setF({ ...BLANK, manufacturer: f.manufacturer, division: f.division, hsn: f.hsn, gstRate: f.gstRate, form: f.form, category: f.category });
        setTouched(false);
        if (editing) nav('/products/new');
      } else {
        nav(`/products/${r.data.data._id}`, { replace: true });
      }
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useHotkey('ctrl+s', () => save(), [f]);
  useHotkey('f2', () => save(), [f]);

  const forms = filters?.forms?.filter(Boolean) || ['Tablet', 'Capsule', 'Syrup', 'Injection'];
  const categories = filters?.categories?.filter(Boolean) || ['Ethical', 'Generic', 'OTC'];
  const units = filters?.units?.length ? filters.units : DEFAULT_UNITS;
  const sched = SCHEDULES.find((s) => s.v === f.schedule);

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        help={['mrp', 'ptr', 'pts', 'hsn', 'scheme', 'schedule', 'reorder']}
        title={editing ? `Edit ${f.name || 'product'}` : 'New Product'}
        crumbs={[{ label: 'Masters' }, { label: 'Products', to: '/products' }, ...(editing ? [{ label: f.name || '…', to: `/products/${id}` }] : [])]}
        subtitle="Ctrl+S / F2 to save"
        actions={
          <>
            <Button onClick={() => nav(editing ? `/products/${id}` : '/products')}>Cancel</Button>
            <Button variant="outlined" onClick={() => save(true)} disabled={saving || !loaded}>Save &amp; New</Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={() => save()} disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
          </>
        }
      />
      {!loaded && <LinearProgress sx={{ mb: 2 }} />}

      <Section title="Basic">
        <Grid item xs={12} md={6}>
          <TextField label="Product name" required autoFocus fullWidth value={f.name} onChange={(e) => set('name', e.target.value)} error={nameErr} helperText={nameErr ? 'Required' : 'As printed on the bill, e.g. "DOLO 650 TAB"'} />
        </Grid>
        <Grid item xs={6} md={2}><TextField label="Code" fullWidth value={f.code} onChange={(e) => set('code', e.target.value)} helperText="Short code for fast billing" /></Grid>
        <Grid item xs={6} md={4}><TextField label="Packing" fullWidth value={f.packing} onChange={(e) => set('packing', e.target.value)} placeholder="10 TAB / 60 ML / 1 VIAL" /></Grid>
        <Grid item xs={12} md={6}><ManufacturerPicker value={f.manufacturer} onChange={(v) => setF((s) => ({ ...s, manufacturer: v, division: v?._id === s.manufacturer?._id ? s.division : '' }))} /></Grid>
        <Grid item xs={12} md={6}>
          <Autocomplete freeSolo options={divisions} value={f.division} onInputChange={(_, v) => set('division', v)}
            renderInput={(p) => <TextField {...p} label="Division" helperText={f.manufacturer && !divisions.length ? 'Add divisions on the Companies screen' : ' '} />} />
        </Grid>
        <Grid item xs={12}><TextField label="Salt / composition" fullWidth value={f.salt} onChange={(e) => set('salt', e.target.value)} placeholder="Paracetamol 650mg" helperText="Used for substitute search at billing" /></Grid>
        <Grid item xs={6} md={3}>
          <Autocomplete freeSolo options={forms} value={f.form} onInputChange={(_, v) => set('form', v)} renderInput={(p) => <TextField {...p} label="Form" />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <Autocomplete freeSolo options={categories} value={f.category} onInputChange={(_, v) => set('category', v)} renderInput={(p) => <TextField {...p} label="Category" />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <TextField select label="Unit" fullWidth value={f.unit} onChange={(e) => set('unit', e.target.value)}>
            {(units.includes(f.unit) ? units : [f.unit, ...units]).map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6} md={3}><NumField label="Units per box / shipper" value={f.unitsPerBox} onChange={(v) => set('unitsPerBox', Math.max(1, v))} inputProps={{ min: 1 }} /></Grid>
      </Section>

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Section title="Tax">
            <Grid item xs={6}><TextField label="HSN code" fullWidth value={f.hsn} onChange={(e) => set('hsn', e.target.value.replace(/\D/g, '').slice(0, 8))} helperText="3004 for most medicines" /></Grid>
            <Grid item xs={6}>
              <TextField select label="GST rate" fullWidth value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>
                {GST_RATES.map((r) => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
              </TextField>
            </Grid>
          </Section>
        </Grid>
        <Grid item xs={12} md={7}>
          <Section title="Regulatory">
            <Grid item xs={12} sm={5}>
              <TextField select label="Schedule" fullWidth value={f.schedule} onChange={(e) => set('schedule', e.target.value)} helperText={sched?.help}>
                {SCHEDULES.map((s) => <MenuItem key={s.v} value={s.v}>{s.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={7} sx={{ display: 'flex', flexDirection: 'column' }}>
              <FormControlLabel control={<Checkbox checked={f.coldChain} onChange={(e) => set('coldChain', e.target.checked)} />} label="Cold chain (store 2–8°C)" />
              <FormControlLabel control={<Checkbox color="error" checked={f.isBanned} onChange={(e) => set('isBanned', e.target.checked)} />} label={<span>Banned / recalled <Typography component="span" variant="caption" color="text.secondary">— blocks invoicing</Typography></span>} />
            </Grid>
          </Section>
        </Grid>
      </Grid>

      <Section
        title="Pricing defaults"
        hint="Defaults for new batches — billing always uses the batch's own MRP/PTR/PTS"
        actions={<Button size="small" startIcon={<CalculateOutlinedIcon />} onClick={calcFromMrp}>PTR/PTS from MRP</Button>}
      >
        <Grid item xs={6} sm={3} md={2}><NumField label="MRP" value={f.mrp} onChange={(v) => set('mrp', v)} /></Grid>
        <Grid item xs={6} sm={3} md={2}><NumField label="PTR" value={f.ptr} onChange={(v) => set('ptr', v)} helperText="Price to retailer" /></Grid>
        <Grid item xs={6} sm={3} md={2}><NumField label="PTS" value={f.pts} onChange={(v) => set('pts', v)} helperText="Price to stockist" /></Grid>
        <Grid item xs={6} sm={3} md={2}><NumField label="Purchase rate" value={f.purchaseRate} onChange={(v) => set('purchaseRate', v)} /></Grid>
        <Grid item xs={6} sm={3} md={2}><NumField label="Default disc." suffix="%" value={f.defaultDiscountPct} onChange={(v) => set('defaultDiscountPct', Math.min(100, v))} /></Grid>
        <Grid item xs={6} sm={3} md={2}>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
            <NumField label="Scheme buy" value={f.schemeBuy} onChange={(v) => set('schemeBuy', v)} />
            <Typography sx={{ pt: 1 }}>+</Typography>
            <NumField label="Free" value={f.schemeFree} onChange={(v) => set('schemeFree', v)} />
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {retailerMargin !== null && <Typography variant="caption" color="text.secondary">Retailer margin on MRP (ex-GST): <b>{retailerMargin.toFixed(1)}%</b></Typography>}
            {ourMargin !== null && <Typography variant="caption" color="text.secondary">Your margin at PTR: <b style={{ color: ourMargin < 0 ? '#c62828' : undefined }}>{ourMargin.toFixed(1)}%</b></Typography>}
            {f.schemeBuy > 0 && f.schemeFree > 0 && <Typography variant="caption" color="text.secondary">Scheme {f.schemeBuy}+{f.schemeFree} = effective {((f.schemeFree / (f.schemeBuy + f.schemeFree)) * 100).toFixed(1)}% off</Typography>}
          </Box>
          {priceWarn.length > 0 && <Alert severity="warning" sx={{ mt: 1, py: 0 }}>{priceWarn.join(' ')}</Alert>}
        </Grid>
      </Section>

      <Section title="Stock control">
        <Grid item xs={6} sm={4} md={2}><TextField label="Rack" fullWidth value={f.rack} onChange={(e) => set('rack', e.target.value.toUpperCase())} /></Grid>
        <Grid item xs={6} sm={8} md={4}><TextField label="Barcode" fullWidth value={f.barcode} onChange={(e) => set('barcode', e.target.value.trim())} helperText="Scan into this box" /></Grid>
        <Grid item xs={6} sm={3} md={1.5}><NumField label="Min stock" value={f.minStock} onChange={(v) => set('minStock', v)} /></Grid>
        <Grid item xs={6} sm={3} md={1.5}><NumField label="Reorder level" value={f.reorderLevel} onChange={(v) => set('reorderLevel', v)} /></Grid>
        <Grid item xs={6} sm={3} md={1.5}><NumField label="Reorder qty" value={f.reorderQty} onChange={(v) => set('reorderQty', v)} /></Grid>
        <Grid item xs={6} sm={3} md={1.5}><NumField label="Max stock" value={f.maxStock} onChange={(v) => set('maxStock', v)} /></Grid>
        <Grid item xs={12}>
          <Typography variant="caption" color="text.secondary">When stock falls to the reorder level the item appears in the Reorder report and Purchase Order suggestions with the reorder qty.</Typography>
        </Grid>
      </Section>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <FormControlLabel control={<Switch checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />} label={f.isActive ? 'Active' : 'Inactive — hidden from billing search'} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => nav(editing ? `/products/${id}` : '/products')}>Cancel</Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => save()} disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
      </Box>
    </Box>
  );
}
