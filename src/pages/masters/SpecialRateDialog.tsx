import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { PartyPicker, PartyOption, ProductPicker, ProductOption } from '../../components/Pickers';
import { useHotkey } from '../../lib/hooks';
import { amt, isoDate } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { NumField } from './masterUi';

export interface SpecialRate {
  _id: string;
  party: { _id: string; name: string } | null;
  product: { _id: string; name: string; manufacturerName?: string; packing?: string; ptr?: number; mrp?: number } | null;
  rate: number; discountPct: number; schemeBuy: number; schemeFree: number; validTill?: string; note: string; updatedAt?: string;
}

// Add / edit a party × product negotiated rate. The backend upserts on
// (party, product), so "add" for an existing pair simply updates it.
export function SpecialRateDialog({ value, fixedParty, onClose, onSaved }: {
  value: Partial<SpecialRate> | null;
  fixedParty?: { _id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const editing = !!value?._id;
  const [party, setParty] = useState<PartyOption | null>(fixedParty ? (fixedParty as PartyOption) : (value?.party as PartyOption) || null);
  const [product, setProduct] = useState<ProductOption | null>((value?.product as ProductOption) || null);
  const [rate, setRate] = useState(value?.rate || 0);
  const [disc, setDisc] = useState(value?.discountPct || 0);
  const [buy, setBuy] = useState(value?.schemeBuy || 0);
  const [free, setFree] = useState(value?.schemeFree || 0);
  const [validTill, setValidTill] = useState(isoDate(value?.validTill));
  const [note, setNote] = useState(value?.note || '');
  const [saving, setSaving] = useState(false);

  const ptr = product?.ptr;
  const mrp = product?.mrp;
  const net = rate > 0 ? rate * (1 - disc / 100) : ptr ? ptr * (1 - disc / 100) : 0;

  const save = async () => {
    if (!party || !product) { enqueueSnackbar('Choose party and product.', { variant: 'warning' }); return; }
    if (!rate && !disc && !(buy && free)) { enqueueSnackbar('Enter a rate, a discount or a scheme.', { variant: 'warning' }); return; }
    setSaving(true);
    try {
      await api.post('/special-rates', { party: party._id, product: product._id, rate, discountPct: disc, schemeBuy: buy, schemeFree: free, validTill: validTill || null, note });
      enqueueSnackbar('Special rate saved.', { variant: 'success' });
      onSaved();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  useHotkey('ctrl+s', save, [party, product, rate, disc, buy, free, validTill, note]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? 'Edit special rate' : 'New special rate'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={1.5} sx={{ pt: 1 }}>
          <Grid item xs={12}>
            {fixedParty || editing
              ? <Typography fontWeight={600}>{party?.name}</Typography>
              : <PartyPicker type="customer" value={party} onChange={setParty} autoFocus />}
          </Grid>
          <Grid item xs={12}>
            {editing
              ? <Typography fontWeight={600}>{product?.name} <Typography component="span" fontSize={12} color="text.secondary">{[product?.manufacturerName, product?.packing].filter(Boolean).join(' · ')}</Typography></Typography>
              : <ProductPicker value={product} onChange={setProduct} autoFocus={!!fixedParty} />}
            {product && <Typography variant="caption" color="text.secondary">Master MRP {amt(mrp)} · PTR {amt(ptr)}</Typography>}
          </Grid>
          <Grid item xs={6} sm={4}><NumField label="Fixed rate (ex-GST)" value={rate} onChange={setRate} helperText="0 = party's normal rate" /></Grid>
          <Grid item xs={6} sm={4}><NumField label="Discount" suffix="%" value={disc} onChange={(v) => setDisc(Math.min(100, v))} /></Grid>
          <Grid item xs={12} sm={4}>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
              <NumField label="Scheme" value={buy} onChange={setBuy} />
              <Typography sx={{ pt: 1 }}>+</Typography>
              <NumField label="Free" value={free} onChange={setFree} />
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}><TextField type="date" label="Valid till" fullWidth value={validTill} onChange={(e) => setValidTill(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Blank = no end date" /></Grid>
          <Grid item xs={12} sm={8}><TextField label="Note" fullWidth value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hospital contract Q3" /></Grid>
          {product && (rate > 0 || disc > 0) && (
            <Grid item xs={12}>
              <Alert severity={ptr && net > ptr ? 'warning' : 'info'} sx={{ py: 0 }}>
                Effective rate ≈ ₹{amt(net)}{ptr ? ` (${(((net - ptr) / ptr) * 100).toFixed(1)}% vs master PTR)` : ''}{buy && free ? ` + ${buy}+${free} scheme` : ''}. Billing uses this instead of the party's rate type for this product.
              </Alert>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
