import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { DateRange, FilterBar, SearchBox } from '../../components/Filters';
import { useConfirm } from '../../components/Dialogs';
import { useDebounced, useFetch, useHotkey } from '../../lib/hooks';
import { amt, fdate, fdatetime, monthStart, num, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { printTable } from '../../print/print';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { REASONS, reasonLabel, reasonOf } from './adjustReasons';

interface AdjItem { product: string; productName: string; batch: string; batchNo: string; bucket: 'saleable' | 'damaged'; qtyChange: number; rate: number }
interface Adj { _id: string; number: string; date: string; reason: string; items: AdjItem[]; totalValue: number; narration: string; createdAt: string }

const ReasonChip = ({ reason }: { reason: string }) => {
  const r = reasonOf(reason);
  return <Chip label={r?.label || reason} color={r?.color === 'default' ? undefined : r?.color} variant="outlined" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
};

export default function StockAdjustments() {
  const nav = useNavigate();
  const { can, business } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState<Adj | null>(null);
  const q = useDebounced(search);
  const params = { from, to, reason, search: q, page: page + 1, limit };
  const { data, loading, reload } = useFetch<{ data: Adj[]; pagination: { total: number }; totals: { total: number; count: number } }>('/stock-adjustments', params);
  const rows = data?.data || [];

  useHotkey('alt+n', () => can('inventory:create') && nav('/stock-adjustments/new'));

  const remove = async (a: Adj) => {
    const { ok } = await confirm({
      title: `Delete ${a.number}?`,
      message: `This reverses the stock effect of all ${a.items.length} line(s). It fails if the stock it added has already been sold.`,
      prompt: 'Reason', promptRequired: true, danger: true, confirmText: 'Delete & reverse',
    });
    if (!ok) return;
    try {
      await api.delete(`/stock-adjustments/${a._id}`);
      enqueueSnackbar(`${a.number} deleted and stock reversed.`, { variant: 'success' });
      setView(null);
      reload();
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const qtySummary = (a: Adj) => {
    const s = a.items.filter((i) => i.bucket === 'saleable').reduce((t, i) => t + i.qtyChange, 0);
    const d = a.items.filter((i) => i.bucket === 'damaged').reduce((t, i) => t + i.qtyChange, 0);
    // damage / expired_to_damaged only store the saleable leg; show the move.
    if (a.reason === 'damage' || a.reason === 'expired_to_damaged') return `${num(Math.abs(s))} → damaged`;
    return [s ? `${s > 0 ? '+' : ''}${num(s)} saleable` : '', d ? `${d > 0 ? '+' : ''}${num(d)} damaged` : ''].filter(Boolean).join(', ');
  };

  const columns: Col<Adj>[] = [
    { key: 'number', label: 'No', nowrap: true, render: (a) => <Typography fontWeight={600} fontSize={13}>{a.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (a) => fdate(a.date) },
    { key: 'reason', label: 'Reason', render: (a) => <ReasonChip reason={a.reason} /> },
    {
      key: 'items', label: 'Products',
      render: (a) => <Typography fontSize={12.5} noWrap sx={{ maxWidth: 360 }}>{a.items.slice(0, 3).map((i) => i.productName).join(', ')}{a.items.length > 3 ? ` +${a.items.length - 3} more` : ''}</Typography>,
    },
    { key: 'qty', label: 'Qty change', align: 'right', nowrap: true, render: qtySummary },
    { key: 'totalValue', label: 'Value', align: 'right', render: (a) => amt(a.totalValue), footer: amt(data?.totals?.total) },
    { key: 'narration', label: 'Narration', render: (a) => <Typography fontSize={12} color="text.secondary" noWrap sx={{ maxWidth: 200 }}>{a.narration}</Typography> },
    {
      key: 'act', label: '', align: 'right',
      render: (a) => can('inventory:cancel') ? (
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Delete & reverse"><IconButton color="error" onClick={() => remove(a)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ) : null,
    },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get('/stock-adjustments', { params: { ...params, page: 1, limit: 500 } });
      const flat = (r.data.data as Adj[]).flatMap((a) => a.items.map((i) => ({ ...i, number: a.number, date: a.date, reason: a.reason, narration: a.narration })));
      exportExcel(`stock-adjustments-${from}-to-${to}`, [{
        name: 'Stock Adjustments', rows: flat,
        columns: [
          { key: 'number', label: 'No' }, { key: 'date', label: 'Date', value: (x) => fdate(x.date) }, { key: 'reason', label: 'Reason', value: (x) => reasonLabel(x.reason) },
          { key: 'productName', label: 'Product' }, { key: 'batchNo', label: 'Batch' }, { key: 'bucket', label: 'Bucket' },
          { key: 'qtyChange', label: 'Qty Change' }, { key: 'rate', label: 'Rate' }, { key: 'value', label: 'Value', value: (x) => Math.abs(x.qtyChange) * x.rate },
          { key: 'narration', label: 'Narration' },
        ],
      }]);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  const printOne = (a: Adj) => {
    if (!business) return;
    printTable(
      `Stock Adjustment ${a.number}`, business, `${fdate(a.date)} · ${reasonLabel(a.reason)}${a.narration ? ' · ' + a.narration : ''}`,
      ['#', 'Product', 'Batch', 'Bucket', 'Qty change', 'Rate', 'Value'],
      a.items.map((i, k) => [k + 1, i.productName, i.batchNo, i.bucket, i.qtyChange, amt(i.rate), amt(Math.abs(i.qtyChange) * i.rate)]),
      ['', '', '', '', '', 'Total', amt(a.totalValue)],
      [4, 5, 6],
    );
  };

  return (
    <>
      <PageHeader
        title="Stock Adjustments"
        crumbs={[{ label: 'Inventory' }]}
        subtitle={data ? `${data.totals?.count || 0} adjustments · value ₹${amt(data.totals?.total)}` : 'Opening stock, shortages, damage and write-offs'}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can('inventory:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/stock-adjustments/new')}>New Adjustment (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Adjustment no" width={200} />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <TextField select label="Reason" value={reason} onChange={(e) => { setReason(e.target.value); setPage(0); }} sx={{ width: 180 }}>
          <MenuItem value="">All reasons</MenuItem>
          {REASONS.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}
        </TextField>
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={data?.pagination?.total || 0}
        page={page}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(0); }}
        onRowClick={setView}
        empty="No stock adjustments in this period."
      />

      {view && (
        <Dialog open onClose={() => setView(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {view.number} <ReasonChip reason={view.reason} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>{fdate(view.date)}</Typography>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{reasonOf(view.reason)?.effect}</Typography>
            {view.narration && <Typography variant="body2" sx={{ mb: 1 }}>Narration: {view.narration}</Typography>}
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Bucket</TableCell><TableCell align="right">Qty change</TableCell><TableCell align="right">Rate</TableCell><TableCell align="right">Value</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {view.items.map((i, k) => (
                  <TableRow key={k} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/products/${i.product}`)}>
                    <TableCell>{k + 1}</TableCell>
                    <TableCell>{i.productName}</TableCell>
                    <TableCell>{i.batchNo}</TableCell>
                    <TableCell>{i.bucket}</TableCell>
                    <TableCell align="right"><Typography fontSize={13} fontWeight={700} color={i.qtyChange > 0 ? 'success.dark' : 'error.main'}>{i.qtyChange > 0 ? '+' : ''}{num(i.qtyChange)}</Typography></TableCell>
                    <TableCell align="right">{amt(i.rate)}</TableCell>
                    <TableCell align="right">{amt(Math.abs(i.qtyChange) * i.rate)}</TableCell>
                  </TableRow>
                ))}
                <TableRow><TableCell colSpan={6} align="right"><b>Total</b></TableCell><TableCell align="right"><b>{amt(view.totalValue)}</b></TableCell></TableRow>
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Entered {fdatetime(view.createdAt)}</Typography>
          </DialogContent>
          <DialogActions>
            {can('inventory:cancel') && <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => remove(view)}>Delete & reverse</Button>}
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<PrintOutlinedIcon />} onClick={() => printOne(view)}>Print</Button>
            <Button variant="contained" onClick={() => setView(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
