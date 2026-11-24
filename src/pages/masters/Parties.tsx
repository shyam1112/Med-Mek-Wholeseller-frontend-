import { useEffect, useState } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox } from '../../components/Filters';
import { RoutePicker } from '../../components/Pickers';
import { useFetch, useDebounced, useHotkey } from '../../lib/hooks';
import { amt, drcr, fdate, num } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Party } from '../../lib/types';
import { DlChip, SmallChip, refName, useUsers } from './masterUi';

// Keyed on type so switching Customers ⇄ Suppliers resets filters.
export default function Parties({ type }: { type: 'customer' | 'supplier' }) {
  return <PartyList key={type} type={type} />;
}

function PartyList({ type }: { type: 'customer' | 'supplier' }) {
  const isCust = type === 'customer';
  const nav = useNavigate();
  const { can } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState<{ _id: string; name: string } | null>(null);
  const [salesman, setSalesman] = useState('');
  const [dl, setDl] = useState('');
  const [active, setActive] = useState('true');
  const [balFilter, setBalFilter] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const salesmen = useUsers('salesman');
  const [sp, setSp] = useSearchParams();

  // ?route=ID (from the Routes screen) preselects the route filter.
  const routeParam = sp.get('route') || '';
  useEffect(() => {
    if (!routeParam || route?._id === routeParam) return;
    api.get(`/routes/${routeParam}`).then((r) => setRoute({ _id: r.data.data._id, name: r.data.data.name })).catch(() => setRoute(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParam]);
  const pickRoute = (v: { _id: string; name: string } | null) => {
    setRoute(v);
    setPage(0);
    const next = new URLSearchParams(sp);
    if (v) next.set('route', v._id); else next.delete('route');
    setSp(next, { replace: true });
  };

  const params = { type, search: q, route: isCust ? route?._id || routeParam : '', salesman: isCust ? salesman : '', dl: isCust ? dl : '', active, page: page + 1, limit };
  const { data, loading } = useFetch<{ data: Party[]; pagination: { total: number } }>('/parties', params);
  let rows = data?.data || [];
  if (balFilter === 'due') rows = rows.filter((r) => (isCust ? (r.balance || 0) > 0.009 : (r.balance || 0) < -0.009));
  if (balFilter === 'over') rows = rows.filter((r) => r.creditLimit > 0 && (r.balance || 0) > r.creditLimit);
  if (balFilter === 'hold') rows = rows.filter((r) => r.isHold);
  const pageBal = rows.reduce((s, r) => s + (r.balance || 0), 0);

  const newUrl = `/parties/new?type=${type}`;
  useHotkey('alt+n', () => can('parties:create') && nav(newUrl));

  const columns: Col<Party>[] = [
    {
      key: 'name', label: isCust ? 'Customer' : 'Supplier',
      render: (r) => (
        <Box sx={{ minWidth: 180 }}>
          <Typography component="span" fontSize={13} fontWeight={600}>{r.name}</Typography>
          {r.isHold && <Tooltip title={r.holdReason || 'On hold'}><span><SmallChip label="HOLD" color="error" /></span></Tooltip>}
          {!r.isActive && <SmallChip label="Inactive" variant="outlined" />}
          {(r.code || r.contactPerson) && <Typography fontSize={11} color="text.secondary">{[r.code, r.contactPerson].filter(Boolean).join(' · ')}</Typography>}
        </Box>
      ),
    },
    { key: 'city', label: 'City / Area', render: (r) => <>{r.city}{r.area && <Typography fontSize={11} color="text.secondary">{r.area}</Typography>}</> },
    ...(isCust ? [{ key: 'route', label: 'Route', render: (r: Party) => refName(r.route) }] : []),
    { key: 'gstin', label: 'GSTIN', nowrap: true, render: (r) => r.gstin || <Typography fontSize={11} color="text.secondary">{r.gstType === 'regular' ? '—' : r.gstType}</Typography> },
    { key: 'mobile', label: 'Mobile', nowrap: true, render: (r) => r.mobile || r.phone },
    {
      key: 'credit', label: 'Credit', align: 'right', nowrap: true,
      render: (r) => (r.creditLimit || r.creditDays ? <>{r.creditLimit ? amt(r.creditLimit) : 'No limit'}<Typography fontSize={11} color="text.secondary">{r.creditDays} days</Typography></> : '—'),
    },
    {
      key: 'balance', label: 'Balance', align: 'right', nowrap: true, footer: drcr(pageBal),
      render: (r) => {
        const b = r.balance || 0;
        const owes = isCust ? b > 0.009 : b < -0.009;
        const over = isCust && r.creditLimit > 0 && b > r.creditLimit;
        return (
          <Tooltip title={over ? `Over credit limit by ${amt(b - r.creditLimit)}` : ''}>
            <Typography fontSize={13} fontWeight={owes ? 700 : 400} color={isCust && owes ? 'error.main' : owes ? 'warning.dark' : 'text.secondary'}>
              {Math.abs(b) < 0.01 ? '—' : drcr(b)}{over && ' ▲'}
            </Typography>
          </Tooltip>
        );
      },
    },
    ...(isCust ? [{ key: 'dl', label: 'DL', render: (r: Party) => (r.dl20b || r.dl21b ? <DlChip expiry={r.dlExpiry} /> : <Typography fontSize={11} color="warning.dark">No DL</Typography>) }] : []),
  ];

  const exportAll = async () => {
    setExporting(true);
    try {
      const all: Party[] = [];
      for (let p = 1; p < 100; p++) {
        const r = await api.get('/parties', { params: { ...params, page: p, limit: 500 } });
        all.push(...r.data.data);
        if (p >= (r.data.pagination?.pages || 1)) break;
      }
      exportExcel(isCust ? 'customers' : 'suppliers', [{
        name: isCust ? 'Customers' : 'Suppliers',
        rows: all,
        columns: [
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'contactPerson', label: 'Contact Person' },
          { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'area', label: 'Area' }, { key: 'pincode', label: 'Pincode' },
          { key: 'stateCode', label: 'State Code' }, { key: 'gstin', label: 'GSTIN' }, { key: 'gstType', label: 'GST Type' }, { key: 'pan', label: 'PAN' },
          { key: 'mobile', label: 'Mobile' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
          ...(isCust ? [
            { key: 'dl20b', label: 'DL 20B' }, { key: 'dl21b', label: 'DL 21B' }, { key: 'dlExpiry', label: 'DL Expiry', value: (r: Party) => fdate(r.dlExpiry) },
            { key: 'route', label: 'Route', value: (r: Party) => refName(r.route) }, { key: 'salesman', label: 'Salesman', value: (r: Party) => refName(r.salesman) },
            { key: 'rateType', label: 'Rate Type' },
          ] : []),
          { key: 'creditLimit', label: 'Credit Limit' }, { key: 'creditDays', label: 'Credit Days' },
          { key: 'balance', label: 'Balance (Dr+/Cr-)' }, { key: 'isHold', label: 'Hold', value: (r) => (r.isHold ? 'Yes' : '') },
          { key: 'isActive', label: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
        ],
      }]);
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = !!(q || route || salesman || dl || active !== 'true' || balFilter);

  return (
    <>
      <PageHeader
        title={isCust ? 'Customers' : 'Suppliers'}
        crumbs={[{ label: 'Masters' }]}
        subtitle={data ? `${num(data.pagination?.total || 0)} ${isCust ? 'customers' : 'suppliers'}` : isCust ? 'Chemists, hospitals and sub-stockists you sell to' : 'Companies, C&F agents and stockists you buy from'}
        actions={
          <>
            {can('parties:create') && <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => nav('/import')}>Import</Button>}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll} disabled={exporting}>{exporting ? 'Exporting…' : 'Excel'}</Button>
            {can('parties:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav(newUrl)}>New {isCust ? 'Customer' : 'Supplier'} (Alt+N)</Button>}
          </>
        }
      />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Name / GSTIN / mobile / city / code" width={280} />
        {isCust && <RoutePicker value={route} onChange={pickRoute} sx={{ width: 180 }} />}
        {isCust && salesmen.length > 0 && (
          <TextField select label="Salesman" value={salesman} onChange={(e) => { setSalesman(e.target.value); setPage(0); }} sx={{ width: 150 }}>
            <MenuItem value="">All</MenuItem>
            {salesmen.map((u) => <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>)}
          </TextField>
        )}
        {isCust && (
          <TextField select label="Drug licence" value={dl} onChange={(e) => { setDl(e.target.value); setPage(0); }} sx={{ width: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="expired">DL expired</MenuItem>
          </TextField>
        )}
        <TextField select label="Balance" value={balFilter} onChange={(e) => setBalFilter(e.target.value)} sx={{ width: 150 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="due">{isCust ? 'Receivable' : 'Payable'}</MenuItem>
          {isCust && <MenuItem value="over">Over credit limit</MenuItem>}
          <MenuItem value="hold">On hold</MenuItem>
        </TextField>
        <TextField select label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }} sx={{ width: 110 }}>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
        {hasFilters && <Button onClick={() => { setSearch(''); pickRoute(null); setSalesman(''); setDl(''); setActive('true'); setBalFilter(''); setPage(0); }}>Clear</Button>}
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
        onRowClick={(r) => nav(`/parties/${r._id}`)}
        rowSx={(r) => (!r.isActive ? { opacity: 0.55 } : r.isHold ? { bgcolor: '#fff6f6' } : undefined)}
        empty={hasFilters ? 'No party matches these filters.' : `No ${isCust ? 'customers' : 'suppliers'} yet — add one or import from Excel.`}
      />
      {balFilter && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>Balance filter applies to the rows on this page; footer total is for the rows shown.</Typography>}
    </>
  );
}
