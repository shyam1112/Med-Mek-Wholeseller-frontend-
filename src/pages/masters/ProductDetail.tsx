import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, Link, MenuItem,
  Paper, Switch, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, FilterBar } from '../../components/Filters';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, fexp, inrShort, isoDate, num, parseExpiry, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Batch, Product } from '../../lib/types';
import { ExpiryText, KV, NumField, SmallChip, daysTo, scheme } from './masterUi';
import StockQuickDialog, { QuickMode } from './StockQuickDialog';
import SwapVertIcon from '@mui/icons-material/SwapVert';

interface Move {
  _id: string; date: string; type: string; bucket: 'saleable' | 'damaged'; qtyIn: number; qtyOut: number; rate: number;
  voucherType: string; voucherId?: string; voucherNo: string; partyName: string; note: string;
  batch?: { _id: string; batchNo: string; expiry: string } | null; balance: number; damagedBalance: number;
}
interface LedgerResp { opening: number; openingDamaged: number; closing: number; closingDamaged: number; data: Move[] }

const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening', purchase: 'Purchase', purchase_cancel: 'Purchase cancelled', sale: 'Sale', sale_cancel: 'Sale cancelled',
  sales_return: 'Sales return', sales_return_cancel: 'Sales return cancelled', purchase_return: 'Purchase return',
  purchase_return_cancel: 'Purchase return cancelled', adjustment: 'Adjustment',
};
const voucherLink = (m: Move) => {
  if (!m.voucherId) return null;
  if (m.voucherType === 'sales') return `/sales/${m.voucherId}`;
  if (m.voucherType === 'purchase') return `/purchases/${m.voucherId}`;
  if (m.voucherType === 'stock_adjustment') return '/stock-adjustments';
  return null;
};
const fyStart = () => { const y = dayjs().month() >= 3 ? dayjs().year() : dayjs().year() - 1; return `${y}-04-01`; };

export default function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const nearDays = business?.settings?.nearExpiryDays || 90;
  const [tab, setTab] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const [edit, setEdit] = useState<Batch | null>(null);
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(today());
  const [batchFilter, setBatchFilter] = useState('');
  const [quick, setQuick] = useState<{ mode: QuickMode; batch?: Batch | null } | null>(null);

  const { data: pd, loading: pLoading } = useFetch<{ data: Product }>(`/products/${id}`);
  const { data: bd, loading: bLoading, reload: reloadBatches } = useFetch<{ data: Batch[] }>(`/products/${id}/batches`, { all: 'true' });
  const since90 = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
  const { data: sales90 } = useFetch<LedgerResp>(`/reports/stock-ledger`, { product: id, from: since90, to: today() });
  const { data: ld, loading: lLoading, reload: reloadLedger } = useFetch<LedgerResp>(tab === 1 ? '/reports/stock-ledger' : null, { product: id, from, to, batch: batchFilter });

  const p = pd?.data;
  const batches = bd?.data || [];
  const shown = showEmpty ? batches : batches.filter((b) => b.qty > 0 || b.damagedQty > 0);

  const stats = useMemo(() => {
    const live = batches.filter((b) => b.qty > 0);
    const stock = live.reduce((s, b) => s + b.qty, 0);
    const damaged = batches.reduce((s, b) => s + b.damagedQty, 0);
    const value = batches.reduce((s, b) => s + (b.qty + b.damagedQty) * (b.landingCost || 0), 0);
    const expiredQty = live.filter((b) => (daysTo(b.expiry) ?? 0) < 0).reduce((s, b) => s + b.qty, 0);
    const nearQty = live.filter((b) => { const d = daysTo(b.expiry) ?? 0; return d >= 0 && d < nearDays; }).reduce((s, b) => s + b.qty, 0);
    const nearest = live.filter((b) => !b.isBlocked).map((b) => b.expiry).sort()[0];
    return { stock, damaged, value, expiredQty, nearQty, nearest };
  }, [batches, nearDays]);

  const sold90 = useMemo(() => {
    let q = 0;
    for (const m of sales90?.data || []) {
      if (m.type === 'sale') q += m.qtyOut;
      if (m.type === 'sale_cancel') q -= m.qtyIn;
      if (m.type === 'sales_return') q -= m.qtyIn;
    }
    return q;
  }, [sales90]);

  const toggleBlock = async (b: Batch) => {
    try {
      await api.put(`/batches/${b._id}`, { isBlocked: !b.isBlocked });
      enqueueSnackbar(`Batch ${b.batchNo} ${b.isBlocked ? 'unblocked' : 'blocked from billing'}.`, { variant: 'success' });
      reloadBatches();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const batchCols: Col<Batch>[] = [
    { key: 'batchNo', label: 'Batch', render: (b) => <><Typography component="span" fontWeight={600} fontSize={13}>{b.batchNo}</Typography>{b.isBlocked && <SmallChip label="BLOCKED" color="error" />}</> },
    { key: 'expiry', label: 'Exp', align: 'center', render: (b) => <ExpiryText expiry={b.expiry} nearDays={nearDays} /> },
    { key: 'days', label: 'Days left', align: 'right', render: (b) => { const d = daysTo(b.expiry) ?? 0; return <Typography fontSize={12} color={d < 0 ? 'error.main' : d < nearDays ? 'warning.dark' : 'text.secondary'}>{d < 0 ? `${-d} ago` : d}</Typography>; } },
    { key: 'mrp', label: 'MRP', align: 'right', render: (b) => amt(b.mrp) },
    { key: 'ptr', label: 'PTR', align: 'right', render: (b) => amt(b.ptr) },
    { key: 'pts', label: 'PTS', align: 'right', render: (b) => amt(b.pts) },
    { key: 'landingCost', label: 'Landing', align: 'right', render: (b) => amt(b.landingCost) },
    { key: 'qty', label: 'Saleable', align: 'right', render: (b) => <Typography fontWeight={700} fontSize={13} color={b.qty > 0 ? 'success.dark' : 'text.disabled'}>{num(b.qty)}</Typography>, footer: num(stats.stock) },
    { key: 'damagedQty', label: 'Damaged', align: 'right', render: (b) => (b.damagedQty ? <Typography fontSize={13} color="error.main" fontWeight={600}>{num(b.damagedQty)}</Typography> : '—'), footer: num(stats.damaged) },
    { key: 'value', label: 'Value', align: 'right', render: (b) => amt((b.qty + b.damagedQty) * (b.landingCost || 0)), footer: amt(stats.value) },
    {
      key: 'actions', label: '', align: 'right', nowrap: true,
      render: (b) => (
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Stock ledger of this batch"><IconButton onClick={() => { setBatchFilter(b._id); setTab(1); }}><TimelineOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          {can('inventory:create') && (
            <Tooltip title="Stock in / out for this batch">
              <IconButton color="primary" onClick={() => setQuick({ mode: (daysTo(b.expiry) ?? 0) < 0 && b.qty > 0 ? 'damage' : b.qty > 0 ? 'out' : b.damagedQty > 0 ? 'destroy' : 'in', batch: b })}><SwapVertIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {can('inventory:edit') && <>
            <Tooltip title="Edit expiry / rates"><IconButton onClick={() => setEdit(b)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title={b.isBlocked ? 'Unblock — allow billing' : 'Block — hide from billing (e.g. NSQ / recall)'}>
              <IconButton color={b.isBlocked ? 'success' : 'error'} onClick={() => toggleBlock(b)}>{b.isBlocked ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}</IconButton>
            </Tooltip>
          </>}
        </Box>
      ),
    },
  ];

  const ledgerRows = ld?.data || [];
  const ledgerCols: Col<Move>[] = [
    { key: 'date', label: 'Date', nowrap: true, render: (m) => fdate(m.date) },
    { key: 'type', label: 'Type', render: (m) => <>{TYPE_LABEL[m.type] || m.type}{m.type === 'adjustment' && m.note ? <Typography component="span" fontSize={11} color="text.secondary"> · {m.note.replace(/_/g, ' ')}</Typography> : null}</> },
    {
      key: 'voucherNo', label: 'Voucher', nowrap: true,
      render: (m) => { const to2 = voucherLink(m); return to2 ? <Link component={RouterLink} to={to2} underline="hover">{m.voucherNo}</Link> : m.voucherNo; },
    },
    { key: 'partyName', label: 'Party' },
    { key: 'batch', label: 'Batch', nowrap: true, render: (m) => (m.batch ? `${m.batch.batchNo} (${fexp(m.batch.expiry)})` : '') },
    { key: 'bucket', label: 'Bucket', render: (m) => (m.bucket === 'damaged' ? <SmallChip label="Damaged" color="error" variant="outlined" /> : '') },
    { key: 'qtyIn', label: 'In', align: 'right', render: (m) => (m.qtyIn ? <Typography fontSize={13} color="success.dark">{num(m.qtyIn)}</Typography> : ''), footer: num(ledgerRows.reduce((s, m) => s + m.qtyIn, 0)) },
    { key: 'qtyOut', label: 'Out', align: 'right', render: (m) => (m.qtyOut ? <Typography fontSize={13} color="error.main">{num(m.qtyOut)}</Typography> : ''), footer: num(ledgerRows.reduce((s, m) => s + m.qtyOut, 0)) },
    { key: 'balance', label: 'Balance', align: 'right', render: (m) => <b>{num(m.balance)}</b>, footer: num(ld?.closing) },
    { key: 'damagedBalance', label: 'Dmg bal', align: 'right', render: (m) => (m.damagedBalance ? num(m.damagedBalance) : '—'), footer: num(ld?.closingDamaged) },
  ];

  const exportLedger = () => {
    if (!p) return;
    exportExcel(`stock-ledger-${p.name}-${from}-to-${to}`, [{
      name: 'Stock Ledger',
      rows: ledgerRows,
      columns: [
        { key: 'date', label: 'Date', value: (m) => fdate(m.date) }, { key: 'type', label: 'Type', value: (m) => TYPE_LABEL[m.type] || m.type },
        { key: 'voucherNo', label: 'Voucher' }, { key: 'partyName', label: 'Party' }, { key: 'batch', label: 'Batch', value: (m) => m.batch?.batchNo || '' },
        { key: 'exp', label: 'Exp', value: (m) => fexp(m.batch?.expiry) }, { key: 'bucket', label: 'Bucket' },
        { key: 'qtyIn', label: 'In' }, { key: 'qtyOut', label: 'Out' }, { key: 'balance', label: 'Balance' }, { key: 'damagedBalance', label: 'Damaged Balance' },
      ],
    }]);
  };

  if (!p) {
    return (
      <>
        <PageHeader title={pLoading ? 'Loading…' : 'Product not found'} crumbs={[{ label: 'Masters' }, { label: 'Products', to: '/products' }]} />
        {!pLoading && <Alert severity="warning" action={<Button onClick={() => nav('/products')}>Back to products</Button>}>This product does not exist or was removed.</Alert>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        help={['batch', 'fefo', 'mrp', 'ptr', 'pts', 'landing', 'reserved', 'damaged', 'adjustment']}
        title={<>{p.name} {p.schedule !== 'None' && <SmallChip label={`Sch ${p.schedule}`} color="warning" />}{p.isBanned && <SmallChip label="BANNED" color="error" />}{!p.isActive && <SmallChip label="Inactive" variant="outlined" />}{p.coldChain && <Tooltip title="Cold chain"><AcUnitIcon sx={{ fontSize: 18, ml: 0.5, color: 'info.main', verticalAlign: 'middle' }} /></Tooltip>}</>}
        subtitle={[p.packing, p.manufacturerName, p.division].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Masters' }, { label: 'Products', to: '/products' }, { label: p.name }]}
        actions={
          <>
            {can('purchase_orders:create') && <Button variant="outlined" onClick={() => nav(`/purchase-orders/new?product=${id}`)}>Purchase Order</Button>}
            {can('inventory:create') && <Button variant="outlined" startIcon={<SwapVertIcon />} onClick={() => setQuick({ mode: 'in' })}>Stock in / out</Button>}
            {can('products:edit') && <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => nav(`/products/${id}/edit`)}>Edit</Button>}
          </>
        }
      />

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={2.4}><StatCard label="Saleable stock" value={`${num(stats.stock)} ${p.unit || ''}`} hint={p.reorderLevel ? `Reorder at ${p.reorderLevel}` : undefined} icon={<Inventory2OutlinedIcon />} tone={stats.stock <= 0 ? 'bad' : p.reorderLevel && stats.stock <= p.reorderLevel ? 'warn' : 'good'} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Stock value (landing)" value={inrShort(stats.value)} hint={stats.damaged ? `${num(stats.damaged)} damaged held` : undefined} icon={<CurrencyRupeeIcon />} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Nearest expiry" value={stats.nearest ? fexp(stats.nearest) : '—'} hint={stats.nearQty ? `${num(stats.nearQty)} expiring in ${nearDays}d` : undefined} icon={<WarningAmberOutlinedIcon />} tone={stats.nearQty ? 'warn' : 'default'} /></Grid>
        <Grid item xs={6} md={2.4}><StatCard label="Expired in saleable" value={num(stats.expiredQty)} hint={stats.expiredQty ? 'Move to damaged' : 'None'} icon={<WarningAmberOutlinedIcon />} tone={stats.expiredQty ? 'bad' : 'good'} onClick={stats.expiredQty && can('inventory:create') ? () => setQuick({ mode: 'damage', batch: batches.find((b) => b.qty > 0 && (daysTo(b.expiry) ?? 0) < 0) }) : undefined} /></Grid>
        <Grid item xs={12} md={2.4}><StatCard label="Sold last 90 days" value={num(sold90)} hint={sold90 ? `≈ ${num(Math.round(sold90 / 3))}/month · ${stats.stock && sold90 ? `${Math.round((stats.stock / sold90) * 90)} days cover` : ''}` : 'No sales'} icon={<TrendingUpIcon />} /></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={4} md={2}><KV label="Code">{p.code}</KV></Grid>
          <Grid item xs={6} sm={4} md={4}><KV label="Salt / composition">{p.salt}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Form · Category">{[p.form, p.category].filter(Boolean).join(' · ')}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="HSN · GST">{`${p.hsn || '—'} · ${p.gstRate}%`}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Rack · Barcode">{[p.rack, p.barcode].filter(Boolean).join(' · ')}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="MRP / PTR / PTS">{`${amt(p.mrp)} / ${amt(p.ptr)} / ${amt(p.pts)}`}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Purchase rate">{amt(p.purchaseRate)}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Scheme · Disc.">{[scheme(p.schemeBuy, p.schemeFree), p.defaultDiscountPct ? `${p.defaultDiscountPct}%` : ''].filter(Boolean).join(' · ') || '—'}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Min / Reorder / Max">{`${p.minStock} / ${p.reorderLevel} (+${p.reorderQty}) / ${p.maxStock}`}</KV></Grid>
          <Grid item xs={6} sm={4} md={2}><KV label="Unit · per box">{`${p.unit} · ${p.unitsPerBox}`}</KV></Grid>
        </Grid>
      </Paper>

      <Paper sx={{ mb: 1.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          <Tab label={`Batches (${batches.filter((b) => b.qty > 0 || b.damagedQty > 0).length})`} />
          <Tab label="Stock ledger" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <>
          <FilterBar>
            <FormControlLabel control={<Switch checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />} label="Show sold-out batches" />
            <Typography variant="caption" color="text.secondary">FEFO order — earliest expiry is billed first. Blocked batches are never offered at billing.</Typography>
          </FilterBar>
          <DataTable columns={batchCols} rows={shown} loading={bLoading} maxHeight="60vh"
            rowSx={(b) => (b.isBlocked ? { bgcolor: '#fff4f4' } : b.qty <= 0 && b.damagedQty <= 0 ? { opacity: 0.5 } : undefined)}
            empty={batches.length ? 'No batch has stock. Toggle "Show sold-out batches" to see history.' : 'No batches yet — stock arrives through a Purchase or an Opening-stock adjustment.'} />
        </>
      )}

      {tab === 1 && (
        <>
          <FilterBar>
            <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            <TextField select label="Batch" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} sx={{ width: 200 }}>
              <MenuItem value="">All batches</MenuItem>
              {batches.map((b) => <MenuItem key={b._id} value={b._id}>{b.batchNo} · {fexp(b.expiry)}</MenuItem>)}
            </TextField>
            <Box sx={{ flex: 1 }} />
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportLedger} disabled={!ledgerRows.length}>Excel</Button>
          </FilterBar>
          {ld && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Opening on {fdate(from)}: <b>{num(ld.opening)}</b>{ld.openingDamaged ? ` (+${num(ld.openingDamaged)} damaged)` : ''} · Closing: <b>{num(ld.closing)}</b>{ld.closingDamaged ? ` (+${num(ld.closingDamaged)} damaged)` : ''}
            </Typography>
          )}
          <DataTable columns={ledgerCols} rows={ledgerRows} loading={lLoading} maxHeight="60vh" empty="No stock movement in this period." />
        </>
      )}

      {edit && <BatchEditDialog batch={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reloadBatches(); }} />}
      <StockQuickDialog open={!!quick} product={p} batches={batches} initialMode={quick?.mode} initialBatch={quick?.batch}
        onClose={() => setQuick(null)} onSaved={() => { reloadBatches(); if (tab === 1) reloadLedger(); }} />
    </>
  );
}

// Correct a batch's expiry / MRP / rates (typo at purchase, revised MRP).
export function BatchEditDialog({ batch, onClose, onSaved }: { batch: Batch; onClose: () => void; onSaved: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [exp, setExp] = useState(fexp(batch.expiry));
  const [mrp, setMrp] = useState(batch.mrp);
  const [ptr, setPtr] = useState(batch.ptr);
  const [pts, setPts] = useState(batch.pts);
  const [saving, setSaving] = useState(false);
  const expIso = parseExpiry(exp);
  const save = async () => {
    if (!expIso) { enqueueSnackbar('Enter expiry as MM/YY.', { variant: 'warning' }); return; }
    setSaving(true);
    try {
      await api.put(`/batches/${batch._id}`, { expiry: expIso, mrp, ptr, pts });
      enqueueSnackbar(`Batch ${batch.batchNo} updated.`, { variant: 'success' });
      onSaved();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit batch {batch.batchNo}</DialogTitle>
      <DialogContent>
        <Grid container spacing={1.5} sx={{ pt: 1 }}>
          <Grid item xs={6}>
            <TextField label="Expiry (MM/YY)" fullWidth autoFocus value={exp} onChange={(e) => setExp(e.target.value)} error={!expIso}
              helperText={expIso ? `Ends ${fdate(expIso)}` : 'e.g. 08/27'} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </Grid>
          <Grid item xs={6}><NumField label="MRP" value={mrp} onChange={setMrp} /></Grid>
          <Grid item xs={6}><NumField label="PTR" value={ptr} onChange={setPtr} /></Grid>
          <Grid item xs={6}><NumField label="PTS" value={pts} onChange={setPts} /></Grid>
        </Grid>
        {expIso && isoDate(batch.expiry) !== expIso && <Alert severity="info" sx={{ mt: 1.5 }}>Expiry changes affect FEFO order and expiry reports. Bills already made keep the old expiry.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
