import { useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox, DateRange } from '../../components/Filters';
import { PartyPicker, PartyOption } from '../../components/Pickers';
import { useFetch, useDebounced, useHotkey } from '../../lib/hooks';
import { amt, fdate, monthStart, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  MODES, MoneyDoc, MoneyKind, MoneyViewDialog, modeLabel, moneyPath, moneyStatusChip, useUsers,
} from './accountsShared';

interface ListResp { data: MoneyDoc[]; pagination: { total: number }; totals: { total: number; count: number } }

// Keyed by kind so switching between /receipts and /payments resets filters.
export default function MoneyList({ kind }: { kind: MoneyKind }) {
  return <MoneyListInner key={kind} kind={kind} />;
}

function MoneyListInner({ kind }: { kind: MoneyKind }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const path = moneyPath(kind);
  const isReceipt = kind === 'receipt';
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [mode, setMode] = useState('');
  const [chequeStatus, setChequeStatus] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState<MoneyDoc | null>(null);
  const q = useDebounced(search);
  const params = { from, to, search: q, party: party?._id, mode, chequeStatus, status, page: page + 1, limit };
  const { data, loading, reload } = useFetch<ListResp>(`/${path}`, params);
  const rows = data?.data || [];
  const users = useUsers();
  const userName = useMemo(() => new Map(users.map((u) => [u._id, u.name])), [users]);
  const collector = (m: MoneyDoc) => m.collectedByName || (m.collectedBy ? userName.get(String(m.collectedBy)) || '' : '');

  const newPath = `/${path}/new`;
  const canCreate = can(`${path}:create`);
  useHotkey('alt+n', () => { if (canCreate) nav(newPath); });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const columns: Col<MoneyDoc>[] = [
    { key: 'number', label: 'No.', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: isReceipt ? 'Received from' : 'Paid to', render: (r) => r.partyName },
    { key: 'mode', label: 'Mode', render: (r) => modeLabel(r.mode) },
    { key: 'accountName', label: 'Account', render: (r) => <Typography fontSize={13} noWrap sx={{ maxWidth: 160 }}>{r.accountName}</Typography> },
    {
      key: 'cheque', label: 'Cheque / Ref', nowrap: true,
      render: (r) => r.chequeNo
        ? <>{r.chequeNo}<Typography component="span" fontSize={11} color="text.secondary"> · {fdate(r.chequeDate)}</Typography></>
        : <Typography component="span" fontSize={12} color="text.secondary">{r.reference}</Typography>,
    },
    { key: 'amount', label: 'Amount', align: 'right', nowrap: true, render: (r) => <b>{amt(r.amount)}</b>, footer: amt(data?.totals?.total) },
    { key: 'discount', label: 'Disc.', align: 'right', render: (r) => (r.discount ? amt(r.discount) : '') },
    { key: 'tds', label: 'TDS', align: 'right', render: (r) => (r.tds ? amt(r.tds) : '') },
    {
      key: 'allocations', label: 'Against bills',
      render: (r) => {
        if (!r.allocations?.length) return <Typography component="span" fontSize={12} color="text.secondary">—</Typography>;
        const nos = r.allocations.map((a) => a.billNo);
        const text = nos.length > 2 ? `${nos.slice(0, 2).join(', ')} +${nos.length - 2}` : nos.join(', ');
        return <Tooltip title={r.allocations.map((a) => `${a.billNo}: ${amt(a.amount)}`).join(' · ')}><Typography fontSize={12} noWrap sx={{ maxWidth: 180 }}>{text}</Typography></Tooltip>;
      },
    },
    { key: 'onAccount', label: 'On a/c', align: 'right', render: (r) => (r.onAccount > 0.009 ? amt(r.onAccount) : '') },
    ...(isReceipt ? [{ key: 'collectedBy', label: 'Collected by', render: (r: MoneyDoc) => collector(r) } as Col<MoneyDoc>] : []),
    { key: 'status', label: 'Status', render: (r) => moneyStatusChip(r) },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get(`/${path}`, { params: Object.fromEntries(Object.entries({ ...params, page: 1, limit: 500 }).filter(([, v]) => v !== '' && v !== undefined)) });
      const list = r.data.data as MoneyDoc[];
      exportExcel(`${path}-register-${from}-to-${to}`, [{
        name: isReceipt ? 'Receipts' : 'Payments',
        rows: list,
        columns: [
          { key: 'number', label: 'No.' },
          { key: 'date', label: 'Date', value: (v) => fdate(v.date) },
          { key: 'partyName', label: 'Party' },
          { key: 'mode', label: 'Mode', value: (v) => modeLabel(v.mode) },
          { key: 'accountName', label: 'Account' },
          { key: 'chequeNo', label: 'Cheque No' },
          { key: 'chequeDate', label: 'Cheque Date', value: (v) => fdate(v.chequeDate) },
          { key: 'bankName', label: 'Drawee Bank' },
          { key: 'reference', label: 'Reference / UTR' },
          { key: 'amount', label: 'Amount' },
          { key: 'discount', label: 'Discount' },
          { key: 'tds', label: 'TDS' },
          { key: 'allocations', label: 'Against Bills', value: (v) => v.allocations.map((a) => `${a.billNo} (${a.amount})`).join(', ') },
          { key: 'onAccount', label: 'On Account' },
          ...(isReceipt ? [{ key: 'collectedBy', label: 'Collected By', value: (v: MoneyDoc) => collector(v) }] : []),
          { key: 'chequeStatus', label: 'Cheque Status', value: (v) => (v.chequeStatus === 'na' ? '' : v.chequeStatus) },
          { key: 'status', label: 'Status' },
          { key: 'narration', label: 'Narration' },
        ],
      }]);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title={isReceipt ? 'Receipts' : 'Payments'}
        subtitle={data ? `${data.totals?.count || 0} entries · ₹${amt(data.totals?.total)} (excluding cancelled)` : isReceipt ? 'Money received from customers' : 'Money paid to suppliers'}
        crumbs={[{ label: 'Accounts' }]}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav(newPath)}>New {isReceipt ? 'Receipt' : 'Payment'} (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={reset(setSearch)} placeholder="No. / party / cheque no" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type={isReceipt ? 'customer' : 'supplier'} value={party} onChange={reset(setParty)} sx={{ width: { xs: '100%', sm: 240 } }} />
        <TextField select label="Mode" value={mode} onChange={(e) => reset(setMode)(e.target.value)} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>
        <TextField select label="Cheque" value={chequeStatus} onChange={(e) => reset(setChequeStatus)(e.target.value)} sx={{ width: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">PDC pending</MenuItem>
          <MenuItem value="cleared">Cleared</MenuItem>
          <MenuItem value="bounced">Bounced</MenuItem>
          <MenuItem value="na">Not a cheque</MenuItem>
        </TextField>
        <TextField select label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} sx={{ width: 120 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
        {(search || party || mode || chequeStatus || status) && (
          <Button size="small" onClick={() => { setSearch(''); setParty(null); setMode(''); setChequeStatus(''); setStatus(''); setPage(0); }}>Clear filters</Button>
        )}
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
        onRowClick={(r) => setView(r)}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : r.chequeStatus === 'bounced' ? { bgcolor: 'rgba(211,47,47,0.05)' } : undefined)}
        empty={`No ${isReceipt ? 'receipts' : 'payments'} in this period.`}
      />
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">Click an entry to view, print, share on WhatsApp, clear/bounce a cheque or cancel.</Typography>
      </Box>
      <MoneyViewDialog voucher={view} onClose={() => setView(null)} onChanged={reload} collectorName={collector} />
    </>
  );
}
