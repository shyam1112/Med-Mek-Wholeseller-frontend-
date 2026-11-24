import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Grid, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { ProductPicker, ProductOption } from '../../components/Pickers';
import { useHotkey } from '../../lib/hooks';
import { useDraft } from '../../lib/useDraft';
import { DraftBanner, DraftStatus } from '../../components/DraftBanner';
import { amt, fexp, num, parseExpiry, today } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import type { Batch, Product } from '../../lib/types';
import { daysTo } from '../masters/masterUi';
import { AdjustReason, REASONS, reasonOf } from './adjustReasons';

interface Line {
  key: number;
  product: ProductOption | null;
  master?: Product;
  batches: Batch[];
  loadingBatches: boolean;
  batchId: string; // '' | batch _id | 'new'
  batchNo: string; exp: string; mrp: number; ptr: number; pts: number; purchaseRate: number;
  qty: string;
  bucket: 'saleable' | 'damaged';
}

let seq = 1;
const blankLine = (): Line => ({ key: seq++, product: null, batches: [], loadingBatches: false, batchId: '', batchNo: '', exp: '', mrp: 0, ptr: 0, pts: 0, purchaseRate: 0, qty: '', bucket: 'saleable' });

// The adjustment as typed so far — auto-saved (see useDraft) so leaving the
// screen, a refresh or a power cut doesn't lose it. Batch lists are fetched
// again on restore, so only what the user entered is kept.
type DraftLine = Pick<Line, 'product' | 'batchId' | 'batchNo' | 'exp' | 'mrp' | 'ptr' | 'pts' | 'purchaseRate' | 'qty' | 'bucket'>;
interface AdjDraft { reason: AdjustReason; date: string; narration: string; lines: DraftLine[] }
const draftLabel = (d: unknown) => {
  const x = d as AdjDraft;
  return `${reasonOf(x.reason)?.label || x.reason} · ${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`;
};

// Which bucket a reason takes stock out of (for availability checks).
const takesFrom = (r: AdjustReason, l: Line): 'saleable' | 'damaged' | null => {
  if (r === 'opening' || r === 'excess') return null;
  if (r === 'destroyed') return 'damaged';
  if (r === 'other') return Number(l.qty) < 0 ? l.bucket : null;
  return 'saleable';
};

// Best default batch for the reason: FEFO for removals, expired first for
// expired→damaged, damaged stock for destruction, new batch for opening.
const defaultBatch = (r: AdjustReason, batches: Batch[]): string => {
  if (r === 'opening' || r === 'excess') return batches.find((b) => b.qty > 0)?._id || (batches.length ? batches[0]._id : 'new');
  if (r === 'destroyed') return batches.find((b) => b.damagedQty > 0)?._id || '';
  if (r === 'expired_to_damaged') return batches.find((b) => b.qty > 0 && (daysTo(b.expiry) ?? 0) < 0)?._id || batches.find((b) => b.qty > 0)?._id || '';
  return batches.find((b) => b.qty > 0)?._id || '';
};

const NumCell = ({ value, onChange, width = 80, autoFocus, error }: { value: number | string; onChange: (v: string) => void; width?: number; autoFocus?: boolean; error?: boolean }) => (
  <TextField type="number" value={value === 0 ? '' : value} onChange={(e) => onChange(e.target.value)} sx={{ width }} autoFocus={autoFocus} error={error}
    inputProps={{ step: 'any', style: { textAlign: 'right' } }} onFocus={(e) => e.target.select()} />
);

export default function StockAdjustmentEntry() {
  const nav = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [reason, setReason] = useState<AdjustReason>('opening');
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const r = reasonOf(reason)!;

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const applyBatch = (l: Line, batchId: string, batches = l.batches, master = l.master): Partial<Line> => {
    if (batchId === 'new') {
      return { batchId, batchNo: '', exp: '', mrp: master?.mrp || l.product?.mrp || 0, ptr: master?.ptr || l.product?.ptr || 0, pts: master?.pts || 0, purchaseRate: master?.purchaseRate || 0 };
    }
    const b = batches.find((x) => x._id === batchId);
    return b ? { batchId, batchNo: b.batchNo, exp: fexp(b.expiry), mrp: b.mrp, ptr: b.ptr, pts: b.pts, purchaseRate: b.purchaseRate } : { batchId: '' };
  };

  const pickProduct = async (l: Line, p: ProductOption | null) => {
    patch(l.key, { product: p, batches: [], batchId: '', loadingBatches: !!p });
    if (!p) return;
    // Keep one empty line at the bottom, Marg-style.
    setLines((ls) => (ls[ls.length - 1].key === l.key ? [...ls, blankLine()] : ls));
    try {
      const res = await api.get(`/products/${p._id}/batches`, { params: { all: 'true' } });
      const batches = res.data.data as Batch[];
      const master = res.data.product as Product;
      const def = defaultBatch(reason, batches);
      setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, batches, master, loadingBatches: false, ...applyBatch({ ...x, master }, def, batches, master) } : x)));
      setTimeout(() => qtyRefs.current[l.key]?.focus(), 50);
    } catch (e) {
      patch(l.key, { loadingBatches: false });
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const removeLine = (key: number) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)));

  const filled = lines.filter((l) => l.product);

  const lineIssue = (l: Line): string => {
    if (!l.product) return '';
    const q = Number(l.qty);
    if (!l.qty || !q) return 'Enter quantity';
    if (reason !== 'other' && q < 0) return 'Quantity must be positive';
    if (!l.batchId) return 'Choose a batch';
    if (l.batchId === 'new') {
      if (!r.allowsNewBatch) return 'New batch only for opening / excess';
      if (!l.batchNo.trim()) return 'Batch no required';
      if (!parseExpiry(l.exp)) return 'Expiry MM/YY';
      if (!(l.mrp > 0)) return 'MRP required';
      return '';
    }
    const b = l.batches.find((x) => x._id === l.batchId);
    const from = takesFrom(reason, l);
    if (b && from) {
      const avail = from === 'damaged' ? b.damagedQty : b.qty;
      if (Math.abs(q) > avail) return `Only ${avail} ${from}`;
    }
    return '';
  };

  const totalQty = filled.reduce((s, l) => s + Math.abs(Number(l.qty) || 0), 0);
  const totalValue = filled.reduce((s, l) => {
    const b = l.batches.find((x) => x._id === l.batchId);
    const rate = b ? b.landingCost || b.purchaseRate : l.purchaseRate || l.ptr;
    return s + Math.abs(Number(l.qty) || 0) * (rate || 0);
  }, 0);

  const save = async () => {
    if (saving) return;
    if (!filled.length) { enqueueSnackbar('Add at least one product.', { variant: 'warning' }); return; }
    const errs = filled.map((l, i) => { const m = lineIssue(l); return m ? `Line ${i + 1} (${l.product!.name}): ${m}` : ''; }).filter(Boolean);
    setErrors(errs);
    if (errs.length) { enqueueSnackbar('Fix the highlighted lines.', { variant: 'warning' }); return; }
    setSaving(true);
    try {
      const items = filled.map((l) => (l.batchId === 'new'
        ? { product: l.product!._id, batchNo: l.batchNo.trim().toUpperCase(), expiry: parseExpiry(l.exp), mrp: l.mrp, ptr: l.ptr, pts: l.pts, purchaseRate: l.purchaseRate, qty: Number(l.qty) }
        : { product: l.product!._id, batch: l.batchId, qty: Number(l.qty), ...(reason === 'other' ? { bucket: l.bucket } : {}) }));
      const res = await api.post('/stock-adjustments', { date, reason, narration, items });
      setSaved(true);
      draft.clear();
      enqueueSnackbar(`Stock adjustment ${res.data.data.number} saved.`, { variant: 'success' });
      nav('/stock-adjustments');
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
      setErrors([errMsg(e)]);
    } finally {
      setSaving(false);
    }
  };
  useHotkey('ctrl+s', save, [lines, reason, date, narration]);
  useHotkey('f2', save, [lines, reason, date, narration]);

  const changeReason = (v: AdjustReason) => {
    setReason(v);
    setErrors([]);
    // Re-pick the sensible default batch for lines already entered.
    setLines((ls) => ls.map((l) => (l.product && l.batches ? { ...l, ...applyBatch(l, defaultBatch(v, l.batches)) } : l)));
  };

  // ---- auto-save ----
  const applyDraft = (d: AdjDraft) => {
    setReason(d.reason); setDate(d.date); setNarration(d.narration); setErrors([]);
    const restored: Line[] = d.lines.map((x) => ({ ...blankLine(), ...x, loadingBatches: !!x.product }));
    setLines([...restored, blankLine()]);
    // Fresh batch lists (stock may have moved); keep the batch the user chose.
    for (const l of restored) {
      if (!l.product) continue;
      api.get(`/products/${l.product._id}/batches`, { params: { all: 'true' } })
        .then((res) => patch(l.key, { batches: res.data.data as Batch[], master: res.data.product as Product, loadingBatches: false }))
        .catch(() => patch(l.key, { loadingBatches: false }));
    }
  };
  const draft = useDraft<AdjDraft>({
    key: 'stock_adjustment:new',
    ready: true,
    autoRestore: true,
    value: filled.length || narration
      ? {
        reason, date, narration,
        lines: filled.map((l) => ({ product: l.product, batchId: l.batchId, batchNo: l.batchNo, exp: l.exp, mrp: l.mrp, ptr: l.ptr, pts: l.pts, purchaseRate: l.purchaseRate, qty: l.qty, bucket: l.bucket })),
      }
      : null,
    apply: applyDraft,
    paused: saved,
  });
  const discardDraft = () => {
    draft.clear();
    setReason('opening'); setDate(today()); setNarration(''); setLines([blankLine()]); setErrors([]);
  };

  return (
    <>
      <PageHeader
        help={['adjustment', 'damaged', 'batch']}
        title="New Stock Adjustment"
        crumbs={[{ label: 'Inventory' }, { label: 'Stock Adjustments', to: '/stock-adjustments' }]}
        subtitle="Ctrl+S / F2 to save"
        actions={
          <>
            <DraftStatus draft={draft} />
            <Button onClick={() => nav('/stock-adjustments')}>Cancel</Button>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !filled.length}>{saving ? 'Saving…' : 'Save (F2)'}</Button>
          </>
        }
      />

      <DraftBanner draft={draft} label={draftLabel} onDiscard={discardDraft} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="flex-start">
          <Grid item xs={12} sm={4} md={3}>
            <TextField select label="Reason" fullWidth value={reason} onChange={(e) => changeReason(e.target.value as AdjustReason)}>
              {REASONS.map((x) => <MenuItem key={x.v} value={x.v}>{x.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2}><TextField type="date" label="Date" fullWidth value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={6} sm={5} md={7}><TextField label="Narration" fullWidth value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Physical stock count 31-Mar" /></Grid>
          <Grid item xs={12}>
            <Alert severity={r.color === 'success' ? 'success' : r.color === 'error' ? 'error' : r.color === 'warning' ? 'warning' : 'info'} sx={{ py: 0 }}>
              <b>{r.label}:</b> {r.effect}
            </Alert>
          </Grid>
        </Grid>
      </Paper>

      {errors.length > 0 && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErrors([])}>{errors.map((e) => <div key={e}>{e}</div>)}</Alert>}

      <Paper sx={{ overflow: 'hidden', mb: 2 }}>
        <TableContainer>
          <Table size="small" sx={{ '& td': { verticalAlign: 'top', py: 0.75 } }}>
            <TableHead>
              <TableRow>
                <TableCell width={30}>#</TableCell>
                <TableCell sx={{ minWidth: 280 }}>Product</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Batch</TableCell>
                <TableCell>Exp</TableCell>
                <TableCell align="right">MRP</TableCell>
                <TableCell align="right">PTR</TableCell>
                <TableCell align="right">PTS</TableCell>
                <TableCell align="right">Pur. rate</TableCell>
                <TableCell align="right">Available</TableCell>
                {reason === 'other' && <TableCell>Bucket</TableCell>}
                <TableCell align="right">Qty</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((l, i) => {
                const isNew = l.batchId === 'new';
                const b = l.batches.find((x) => x._id === l.batchId);
                const issue = l.product && (l.qty || errors.length) ? lineIssue(l) : '';
                return (
                  <TableRow key={l.key} sx={{ bgcolor: issue ? '#fff6f6' : undefined }}>
                    <TableCell sx={{ pt: '14px !important' }}>{i + 1}</TableCell>
                    <TableCell>
                      <Box data-line={l.key}>
                        <ProductPicker value={l.product} onChange={(p) => pickProduct(l, p)} label="" placeholder="Type product name…" autoFocus={i === lines.length - 1 && i > 0} />
                      </Box>
                    </TableCell>
                    <TableCell>
                      {l.product && (
                        <TextField select fullWidth value={l.batchId} onChange={(e) => patch(l.key, applyBatch(l, e.target.value))} disabled={l.loadingBatches}
                          SelectProps={{ displayEmpty: true }} error={!l.batchId && !l.loadingBatches}>
                          <MenuItem value="" disabled>{l.loadingBatches ? 'Loading…' : l.batches.length ? 'Choose batch' : 'No batches'}</MenuItem>
                          {l.batches.map((x) => {
                            const d = daysTo(x.expiry) ?? 0;
                            return (
                              <MenuItem key={x._id} value={x._id}>
                                <Box sx={{ display: 'flex', gap: 1.5, width: '100%' }}>
                                  <b>{x.batchNo}</b>
                                  <Typography component="span" fontSize={12} color={d < 0 ? 'error.main' : 'text.secondary'}>{fexp(x.expiry)}</Typography>
                                  <Typography component="span" fontSize={12} sx={{ ml: 'auto' }}>{x.qty}{x.damagedQty ? ` / ${x.damagedQty} dmg` : ''}</Typography>
                                  {x.isBlocked && <Typography component="span" fontSize={11} color="error.main">blocked</Typography>}
                                </Box>
                              </MenuItem>
                            );
                          })}
                          {r.allowsNewBatch && <MenuItem value="new"><AddIcon fontSize="small" sx={{ mr: 0.5 }} /> New batch</MenuItem>}
                        </TextField>
                      )}
                      {isNew && <TextField sx={{ mt: 0.75 }} fullWidth placeholder="Batch no" value={l.batchNo} onChange={(e) => patch(l.key, { batchNo: e.target.value.toUpperCase() })} autoFocus error={!!errors.length && !l.batchNo.trim()} />}
                    </TableCell>
                    <TableCell>
                      {isNew
                        ? <TextField placeholder="MM/YY" value={l.exp} onChange={(e) => patch(l.key, { exp: e.target.value })} sx={{ width: 80 }} error={!!l.exp && !parseExpiry(l.exp)} />
                        : b ? <Typography fontSize={13} sx={{ pt: 0.75 }} color={(daysTo(b.expiry) ?? 0) < 0 ? 'error.main' : undefined}>{fexp(b.expiry)}</Typography> : null}
                    </TableCell>
                    {(['mrp', 'ptr', 'pts', 'purchaseRate'] as const).map((k) => (
                      <TableCell key={k} align="right">
                        {isNew
                          ? <NumCell value={l[k]} onChange={(v) => patch(l.key, { [k]: Number(v) || 0 })} width={k === 'purchaseRate' ? 90 : 80} error={k === 'mrp' && !!errors.length && !(l.mrp > 0)} />
                          : b ? <Typography fontSize={13} sx={{ pt: 0.75 }}>{amt(k === 'purchaseRate' ? b.landingCost || b.purchaseRate : b[k])}</Typography> : null}
                      </TableCell>
                    ))}
                    <TableCell align="right">
                      {b && <Typography fontSize={13} sx={{ pt: 0.75 }} fontWeight={600}>{num(b.qty)}{b.damagedQty ? <Typography component="span" fontSize={11} color="error.main"> +{b.damagedQty} dmg</Typography> : null}</Typography>}
                      {isNew && <Typography fontSize={12} sx={{ pt: 0.75 }} color="text.secondary">new</Typography>}
                    </TableCell>
                    {reason === 'other' && (
                      <TableCell>
                        {l.product && (
                          <TextField select value={l.bucket} onChange={(e) => patch(l.key, { bucket: e.target.value as Line['bucket'] })} sx={{ width: 110 }}>
                            <MenuItem value="saleable">Saleable</MenuItem>
                            <MenuItem value="damaged">Damaged</MenuItem>
                          </TextField>
                        )}
                      </TableCell>
                    )}
                    <TableCell align="right">
                      {l.product && (
                        <Tooltip title={issue} open={!!issue && !!l.qty} placement="left">
                          <TextField type="number" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} sx={{ width: 90 }} error={!!issue}
                            inputRef={(el) => { qtyRefs.current[l.key] = el; }} inputProps={{ step: 'any', style: { textAlign: 'right', fontWeight: 700 } }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const last = lines[lines.length - 1]; (document.querySelector(`[data-line="${last.key}"] input`) as HTMLInputElement | null)?.focus(); } }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {(l.product || lines.length > 1) && <IconButton onClick={() => removeLine(l.key)} tabIndex={-1}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#f7f9fb' }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, blankLine()])}>Add line</Button>
          <Box sx={{ flex: 1 }} />
          <Typography fontSize={13}>Lines: <b>{filled.length}</b></Typography>
          <Typography fontSize={13}>Total qty: <b>{num(totalQty)}</b></Typography>
          <Typography fontSize={13}>Approx. value: <b>₹{amt(totalValue)}</b></Typography>
        </Box>
      </Paper>
      {r.allowsNewBatch && (
        <Typography variant="caption" color="text.secondary">
          Tip: for many items, use Masters → Import → Opening stock to load an Excel sheet. Same batch no + MRP adds to the existing batch.
        </Typography>
      )}
    </>
  );
}
