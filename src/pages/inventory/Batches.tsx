import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Grid, IconButton, Link, Paper, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { ManufacturerPicker } from '../../components/Pickers';
import { StatCard } from '../../components/StatCard';
import { useDebounced, useFetch } from '../../lib/hooks';
import { amt, fexp, inrShort, num } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ExpiryText, NumField, SmallChip } from '../masters/masterUi';

interface Row {
  _id: string; product: string; productName: string; manufacturerName: string; packing: string; batchNo: string; expiry: string;
  mrp: number; ptr: number; landingCost: number; qty: number; damagedQty: number; isBlocked: boolean; supplierName: string;
  value: number; daysToExpiry: number;
}

const MODES = [
  { v: 'all', label: 'All stock' },
  { v: 'near_expiry', label: 'Near expiry' },
  { v: 'expired', label: 'Expired' },
  { v: 'damaged', label: 'Damaged' },
];

export default function Batches() {
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const nearDefault = business?.settings?.nearExpiryDays || 90;
  const [mode, setMode] = useState('near_expiry');
  const [days, setDays] = useState(nearDefault);
  const [mfr, setMfr] = useState<{ _id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [move, setMove] = useState<Row[] | null>(null);
  const daysQ = useDebounced(days, 400);
  const { data, loading, reload } = useFetch<{ data: Row[]; totalValue: number }>('/reports/batch-stock', {
    mode, days: mode === 'near_expiry' ? daysQ : '', manufacturer: mfr?._id,
  });

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.data || []).filter((r) => !q || `${r.productName} ${r.batchNo} ${r.manufacturerName} ${r.supplierName}`.toLowerCase().includes(q)), [data, q]);
  const totals = useMemo(() => ({
    qty: rows.reduce((s, r) => s + r.qty, 0),
    dmg: rows.reduce((s, r) => s + r.damagedQty, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
    saleableValue: rows.reduce((s, r) => s + r.qty * (r.landingCost || 0), 0),
    products: new Set(rows.map((r) => r.product)).size,
  }), [rows]);

  const toggleBlock = async (r: Row) => {
    try {
      await api.put(`/batches/${r._id}`, { isBlocked: !r.isBlocked });
      enqueueSnackbar(`${r.productName} batch ${r.batchNo} ${r.isBlocked ? 'unblocked' : 'blocked'}.`, { variant: 'success' });
      reload();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const nearColor = (d: number) => (d < 0 ? 'error.main' : d < nearDefault ? 'warning.dark' : 'text.secondary');

  const columns: Col<Row>[] = [
    {
      key: 'productName', label: 'Product',
      render: (r) => (
        <Box sx={{ minWidth: 180 }}>
          <Link component={RouterLink} to={`/products/${r.product}`} underline="hover" fontSize={13} fontWeight={600} color="text.primary">{r.productName}</Link>
          {r.isBlocked && <SmallChip label="BLOCKED" color="error" />}
          <Typography fontSize={11} color="text.secondary">{r.packing}</Typography>
        </Box>
      ),
    },
    { key: 'manufacturerName', label: 'Company', render: (r) => <Typography fontSize={12.5} noWrap sx={{ maxWidth: 150 }}>{r.manufacturerName}</Typography> },
    { key: 'batchNo', label: 'Batch', nowrap: true },
    { key: 'expiry', label: 'Exp', align: 'center', render: (r) => <ExpiryText expiry={r.expiry} nearDays={nearDefault} /> },
    { key: 'daysToExpiry', label: 'Days', align: 'right', render: (r) => <Typography fontSize={12.5} fontWeight={600} color={nearColor(r.daysToExpiry)}>{r.daysToExpiry < 0 ? `${-r.daysToExpiry} ago` : r.daysToExpiry}</Typography> },
    { key: 'mrp', label: 'MRP', align: 'right', render: (r) => amt(r.mrp) },
    { key: 'ptr', label: 'PTR', align: 'right', render: (r) => amt(r.ptr) },
    { key: 'landingCost', label: 'Landing', align: 'right', render: (r) => amt(r.landingCost) },
    { key: 'qty', label: 'Saleable', align: 'right', render: (r) => (r.qty ? <b>{num(r.qty)}</b> : '—'), footer: num(totals.qty) },
    { key: 'damagedQty', label: 'Damaged', align: 'right', render: (r) => (r.damagedQty ? <Typography fontSize={13} color="error.main" fontWeight={600}>{num(r.damagedQty)}</Typography> : '—'), footer: num(totals.dmg) },
    { key: 'value', label: 'Value', align: 'right', render: (r) => amt(r.value), footer: amt(totals.value) },
    { key: 'supplierName', label: 'Supplier', render: (r) => <Typography fontSize={12} noWrap sx={{ maxWidth: 150 }}>{r.supplierName}</Typography> },
    {
      key: 'act', label: '', align: 'right', nowrap: true,
      render: (r) => (
        <Box onClick={(e) => e.stopPropagation()}>
          {can('inventory:create') && r.qty > 0 && <Tooltip title="Move to damaged (non-saleable)"><IconButton color="warning" onClick={() => setMove([r])}><MoveDownIcon fontSize="small" /></IconButton></Tooltip>}
          {can('inventory:edit') && (
            <Tooltip title={r.isBlocked ? 'Unblock — allow billing' : 'Block — hide from billing'}>
              <IconButton color={r.isBlocked ? 'success' : 'error'} onClick={() => toggleBlock(r)}>{r.isBlocked ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}</IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  const exportAll = () => exportExcel(`batches-${mode}`, [{
    name: MODES.find((m) => m.v === mode)?.label || 'Batches',
    rows,
    columns: [
      { key: 'productName', label: 'Product' }, { key: 'packing', label: 'Packing' }, { key: 'manufacturerName', label: 'Company' },
      { key: 'batchNo', label: 'Batch' }, { key: 'expiry', label: 'Exp', value: (r) => fexp(r.expiry) }, { key: 'daysToExpiry', label: 'Days to Expiry' },
      { key: 'mrp', label: 'MRP' }, { key: 'ptr', label: 'PTR' }, { key: 'landingCost', label: 'Landing Cost' },
      { key: 'qty', label: 'Saleable Qty' }, { key: 'damagedQty', label: 'Damaged Qty' }, { key: 'value', label: 'Value' },
      { key: 'supplierName', label: 'Supplier' }, { key: 'isBlocked', label: 'Blocked', value: (r) => (r.isBlocked ? 'Yes' : '') },
    ],
  }]);

  const movable = rows.filter((r) => r.qty > 0);

  return (
    <>
      <PageHeader
        help={['batch', 'expiry', 'nearexpiry', 'fefo', 'damaged', 'reserved']}
        title="Batches & Expiry"
        crumbs={[{ label: 'Inventory' }]}
        subtitle="Batch-wise stock, near-expiry and damaged goods"
        actions={
          <>
            {mode === 'expired' && can('inventory:create') && movable.length > 0 && (
              <Button variant="contained" color="warning" startIcon={<MoveDownIcon />} onClick={() => setMove(movable)}>Move all {movable.length} to damaged</Button>
            )}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll} disabled={!rows.length}>Excel</Button>
          </>
        }
      />

      <Paper sx={{ mb: 1.5 }}>
        <Tabs value={mode} onChange={(_, v) => setMode(v)} variant="scrollable" sx={{ px: 1 }}>
          {MODES.map((m) => <Tab key={m.v} value={m.v} label={m.label} />)}
        </Tabs>
      </Paper>

      {mode === 'damaged' && (
        <Alert severity="info" sx={{ mb: 1.5 }} action={can('purchase_returns:create') ? <Button component={RouterLink} to="/purchase-returns/new" size="small">New debit note</Button> : undefined}>
          Return these to the company via <Link component={RouterLink} to="/purchase-returns/new">Purchase Returns (debit note)</Link> to claim expiry/breakage credit. Use a “Destroyed” stock adjustment for goods that cannot be claimed.
        </Alert>
      )}
      {mode === 'expired' && rows.some((r) => r.qty > 0) && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>Expired goods are still in saleable stock. Move them to damaged so they are never billed, then claim them from the company.</Alert>
      )}

      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        <Grid item xs={6} md={3}><StatCard label="Batches" value={num(rows.length)} hint={`${num(totals.products)} products`} icon={<Inventory2OutlinedIcon />} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Saleable qty" value={num(totals.qty)} hint={inrShort(totals.saleableValue)} tone={mode === 'expired' && totals.qty ? 'bad' : 'default'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Damaged qty" value={num(totals.dmg)} tone={totals.dmg ? 'warn' : 'default'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Value (landing cost)" value={inrShort(totals.value)} hint={data && !q ? `Report total ${inrShort(data.totalValue)}` : undefined} tone={mode === 'expired' || mode === 'damaged' ? 'bad' : 'default'} /></Grid>
      </Grid>

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Product / batch / supplier" />
        <ManufacturerPicker value={mfr} onChange={setMfr} sx={{ width: 240 }} />
        {mode === 'near_expiry' && (
          <NumField label="Expiring within" suffix="days" value={days} onChange={(v) => setDays(Math.max(1, Math.round(v)))} fullWidth={false} sx={{ width: 160 }} />
        )}
        {mode === 'near_expiry' && [30, 60, 90, 180].map((d) => <Button key={d} size="small" variant={days === d ? 'contained' : 'text'} onClick={() => setDays(d)}>{d}d</Button>)}
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => nav(`/products/${r.product}`)}
        rowSx={(r) => (r.isBlocked ? { bgcolor: '#fff4f4' } : undefined)}
        empty={
          mode === 'near_expiry' ? `Nothing expires in the next ${days} days.` :
          mode === 'expired' ? 'No expired goods in saleable stock.' :
          mode === 'damaged' ? 'No damaged / expiry-returned goods held.' : 'No stock.'
        }
      />

      {move && <MoveDialog rows={move} onClose={() => setMove(null)} onDone={() => { setMove(null); reload(); }} />}
    </>
  );
}

function MoveDialog({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const single = rows.length === 1 ? rows[0] : null;
  const [qty, setQty] = useState(single?.qty || 0);
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const go = async () => {
    if (single && !(qty > 0 && qty <= single.qty)) { enqueueSnackbar(`Quantity must be 1 to ${single.qty}.`, { variant: 'warning' }); return; }
    setSaving(true);
    try {
      const items = rows.map((r) => ({ product: r.product, batch: r._id, qty: single ? qty : r.qty }));
      const res = await api.post('/stock-adjustments', { reason: 'expired_to_damaged', items, narration: narration || (single ? '' : 'Expired stock moved to damaged') });
      enqueueSnackbar(`Moved to damaged — ${res.data.data.number}.`, { variant: 'success' });
      onDone();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Move to damaged</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {single
            ? <>{single.productName} · batch {single.batchNo} · exp {fexp(single.expiry)}. Saleable stock: <b>{single.qty}</b>.</>
            : <>{rows.length} batches, {num(rows.reduce((s, r) => s + r.qty, 0))} units in total, will leave saleable stock.</>}
            {' '}Goods in the damaged bucket are never offered at billing and can be returned to the company on a debit note.
        </DialogContentText>
        {single && <NumField label="Quantity" autoFocus value={qty} onChange={setQty} inputProps={{ max: single.qty, min: 1 }} sx={{ mb: 1.5 }} />}
        <TextField label="Narration" fullWidth value={narration} onChange={(e) => setNarration(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={go} disabled={saving}>{saving ? 'Moving…' : 'Move'}</Button>
      </DialogActions>
    </Dialog>
  );
}
