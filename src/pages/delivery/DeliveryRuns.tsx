import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, LinearProgress, MenuItem,
  Paper, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar } from '../../components/Filters';
import { RoutePicker } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../lib/hooks';
import { amt, fdate, num, today } from '../../lib/format';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { User } from '../../lib/types';
import { DeliveryRun, runTotals } from './deliveryUtils';

interface PendingBill {
  _id: string; number: string; date: string; partyName: string; partyAddress: string; grandTotal: number; balance: number;
  boxes: number; route?: string; paymentMode?: string;
}

export default function DeliveryRuns() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'runs' ? 'runs' : 'ready';
  return (
    <>
      <PageHeader title="Dispatch & Delivery" subtitle="Group billed orders into delivery runs, track drops and cash collected" />
      <Tabs value={tab} onChange={(_, v) => setSp(v === 'runs' ? { tab: 'runs' } : {}, { replace: true })} sx={{ mb: 1.5 }}>
        <Tab value="ready" label="Ready to dispatch" />
        <Tab value="runs" label="Delivery runs" />
      </Tabs>
      {tab === 'ready' ? <ReadyToDispatch /> : <RunsList />}
    </>
  );
}

function ReadyToDispatch() {
  const nav = useNavigate();
  const { can } = useAuth();
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const [route, setRoute] = useState<{ _id: string; name: string } | null>(null);
  const { data, loading, reload } = useFetch<{ data: PendingBill[] }>('/delivery-runs/pending', { route: route?._id });
  const { data: routesData } = useFetch<{ data: { _id: string; name: string }[] }>('/routes', { limit: 500 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const bills = data?.data || [];

  useEffect(() => { setSel(new Set()); }, [data]);

  const routeName = useMemo(() => new Map((routesData?.data || []).map((r) => [r._id, r.name])), [routesData]);
  const groups = useMemo(() => {
    const m = new Map<string, PendingBill[]>();
    for (const b of bills) { const k = b.route ? String(b.route) : ''; m.set(k, [...(m.get(k) || []), b]); }
    return [...m.entries()].map(([k, list]) => ({ key: k, name: k ? routeName.get(k) || 'Route' : 'No route', list }))
      .sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || a.name.localeCompare(b.name));
  }, [bills, routeName]);

  const selected = bills.filter((b) => sel.has(b._id));
  const toggle = (ids: string[], on: boolean) => setSel((s) => { const x = new Set(s); ids.forEach((i) => (on ? x.add(i) : x.delete(i))); return x; });
  const selRoutes = [...new Set(selected.map((b) => b.route).filter(Boolean))] as string[];

  return (
    <>
      <FilterBar>
        <RoutePicker value={route} onChange={setRoute} sx={{ width: { xs: '100%', sm: 240 } }} />
        <Button startIcon={<RefreshIcon />} onClick={reload}>Refresh</Button>
        <Box sx={{ flex: 1 }} />
        {can('delivery:create') && (
          <Button variant="contained" startIcon={<LocalShippingOutlinedIcon />} disabled={!selected.length} onClick={() => setCreateOpen(true)}>
            Create run{selected.length ? ` (${selected.length})` : ''}
          </Button>
        )}
      </FilterBar>
      {selected.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {selected.length} bills · {num(selected.reduce((s, b) => s + (b.boxes || 0), 0))} boxes · ₹{amt(selected.reduce((s, b) => s + b.grandTotal, 0))} (balance ₹{amt(selected.reduce((s, b) => s + b.balance, 0))})
        </Alert>
      )}
      {loading && <LinearProgress />}
      {!loading && !bills.length && <Paper sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">No bills waiting for dispatch{route ? ' on this route' : ''}.</Typography></Paper>}
      {groups.map((g) => {
        const ids = g.list.map((b) => b._id);
        const all = ids.every((i) => sel.has(i));
        const some = ids.some((i) => sel.has(i));
        return (
          <Paper key={g.key || 'none'} sx={{ mb: 2, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, bgcolor: '#f7f9fb', borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
              <Checkbox checked={all} indeterminate={!all && some} onChange={(e) => toggle(ids, e.target.checked)} />
              <Typography fontWeight={700}>{g.name}</Typography>
              <Typography fontSize={12} color="text.secondary" sx={{ ml: 'auto', pr: 1 }}>
                {g.list.length} bills · {num(g.list.reduce((s, b) => s + (b.boxes || 0), 0))} boxes · ₹{amt(g.list.reduce((s, b) => s + b.grandTotal, 0))}
              </Typography>
            </Box>
            {isXs ? (
              g.list.map((b) => (
                <Box key={b._id} onClick={() => toggle([b._id], !sel.has(b._id))} sx={{ display: 'flex', gap: 1, p: 1, borderBottom: 1, borderColor: 'divider', cursor: 'pointer' }}>
                  <Checkbox checked={sel.has(b._id)} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} fontSize={14}>{b.partyName}</Typography>
                    <Typography fontSize={12} color="text.secondary">{b.number} · {fdate(b.date)} · {b.boxes || 0} boxes</Typography>
                  </Box>
                  <Typography fontWeight={700}>₹{amt(b.grandTotal)}</Typography>
                </Box>
              ))
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" /><TableCell>Bill No</TableCell><TableCell>Date</TableCell><TableCell>Party</TableCell><TableCell>Address</TableCell>
                    <TableCell>Mode</TableCell><TableCell align="right">Boxes</TableCell><TableCell align="right">Bill amount</TableCell><TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {g.list.map((b) => (
                    <TableRow key={b._id} hover selected={sel.has(b._id)} onClick={() => toggle([b._id], !sel.has(b._id))} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={sel.has(b._id)} /></TableCell>
                      <TableCell><Typography fontWeight={600} fontSize={13}>{b.number}</Typography></TableCell>
                      <TableCell>{fdate(b.date)}</TableCell>
                      <TableCell>{b.partyName}</TableCell>
                      <TableCell sx={{ maxWidth: 260 }}><Typography fontSize={12} color="text.secondary" noWrap>{b.partyAddress}</Typography></TableCell>
                      <TableCell>{b.paymentMode === 'cash' ? 'Cash' : 'Credit'}</TableCell>
                      <TableCell align="right">{b.boxes || <Typography component="span" fontSize={12} color="warning.main">—</Typography>}</TableCell>
                      <TableCell align="right"><b>{amt(b.grandTotal)}</b></TableCell>
                      <TableCell align="right">{amt(b.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        );
      })}
      <CreateRunDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        bills={selected}
        defaultRoute={selRoutes.length === 1 ? { _id: selRoutes[0], name: routeName.get(selRoutes[0]) || '' } : route}
        onCreated={(run) => nav(`/delivery/${run._id}`)}
      />
    </>
  );
}

function CreateRunDialog({ open, onClose, bills, defaultRoute, onCreated }: {
  open: boolean; onClose: () => void; bills: PendingBill[]; defaultRoute: { _id: string; name: string } | null; onCreated: (r: DeliveryRun) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: usersData } = useFetch<{ data: User[] }>(open ? '/users' : null);
  const [date, setDate] = useState(today());
  const [route, setRoute] = useState<{ _id: string; name: string } | null>(null);
  const [person, setPerson] = useState('');
  const [personName, setPersonName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setRoute(defaultRoute); setDate(today()); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = (usersData?.data || []).filter((u) => u.isActive && (u.role === 'dispatch' || u.role === 'salesman'))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'dispatch' ? -1 : 1));

  const create = async () => {
    setSaving(true);
    try {
      const r = await api.post('/delivery-runs', {
        invoices: bills.map((b) => b._id), date, route: route?._id, deliveryPerson: person && person !== '_other' ? person : undefined,
        deliveryPersonName: person === '_other' ? personName : undefined, vehicleNo, narration,
      });
      enqueueSnackbar(`Delivery run ${r.data.data.number} created`, { variant: 'success' });
      onCreated(r.data.data);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create delivery run</DialogTitle>
      <DialogContent>
        <Typography fontSize={13} color="text.secondary" sx={{ mb: 2 }}>
          {bills.length} bills · {num(bills.reduce((s, b) => s + (b.boxes || 0), 0))} boxes · ₹{amt(bills.reduce((s, b) => s + b.grandTotal, 0))}
        </Typography>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={5}><TextField type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} sm={7}><RoutePicker value={route} onChange={setRoute} /></Grid>
          <Grid item xs={12} sm={7}>
            <TextField select label="Delivery person" value={person} onChange={(e) => setPerson(e.target.value)} fullWidth>
              <MenuItem value="">— Not assigned —</MenuItem>
              {people.map((u) => <MenuItem key={u._id} value={u._id}>{u.name} <Typography component="span" fontSize={11} color="text.secondary" sx={{ ml: 1 }}>{u.role}</Typography></MenuItem>)}
              <MenuItem value="_other">Other (type name)…</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={5}><TextField label="Vehicle no" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} fullWidth placeholder="GJ01AB1234" /></Grid>
          {person === '_other' && <Grid item xs={12}><TextField label="Delivery person name" value={personName} onChange={(e) => setPersonName(e.target.value)} fullWidth autoFocus /></Grid>}
          <Grid item xs={12}><TextField label="Narration" value={narration} onChange={(e) => setNarration(e.target.value)} fullWidth /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create} disabled={saving || !bills.length} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <LocalShippingOutlinedIcon />}>Create run</Button>
      </DialogActions>
    </Dialog>
  );
}

function RunsList() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const { data, loading } = useFetch<{ data: DeliveryRun[]; pagination: { total: number } }>('/delivery-runs', { status, page: page + 1, limit });
  const rows = data?.data || [];
  const open = rows.filter((r) => r.status !== 'closed');

  const columns: Col<DeliveryRun>[] = [
    { key: 'number', label: 'Run No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'routeName', label: 'Route' },
    { key: 'deliveryPersonName', label: 'Delivery by' },
    { key: 'vehicleNo', label: 'Vehicle' },
    { key: 'bills', label: 'Bills', align: 'right', render: (r) => r.stops.length },
    { key: 'done', label: 'Delivered', align: 'right', render: (r) => { const t = runTotals(r); return `${t.delivered}/${r.stops.length}${t.returned ? ` · ${t.returned} ret` : ''}`; } },
    { key: 'boxes', label: 'Boxes', align: 'right', render: (r) => runTotals(r).boxes },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => amt(runTotals(r).amount) },
    { key: 'collected', label: 'Collected', align: 'right', render: (r) => <b>{amt(runTotals(r).collected)}</b> },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
  ];

  return (
    <>
      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        <Grid item xs={6} md={3}><StatCard label="Runs on road (this page)" value={open.length} tone={open.length ? 'warn' : 'default'} /></Grid>
        <Grid item xs={6} md={3}><StatCard label="Cash with delivery staff" value={`₹${amt(open.reduce((s, r) => s + runTotals(r).collected, 0))}`} hint="Collected on open runs" /></Grid>
      </Grid>
      <FilterBar>
        <TextField select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ width: 160 }}>
          <MenuItem value="">All</MenuItem><MenuItem value="open">Open</MenuItem><MenuItem value="dispatched">Dispatched</MenuItem><MenuItem value="closed">Closed</MenuItem>
        </TextField>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} total={data?.pagination?.total || 0} page={page} limit={limit}
        onPage={setPage} onLimit={(l) => { setLimit(l); setPage(0); }} onRowClick={(r) => nav(`/delivery/${r._id}`)} empty="No delivery runs yet." />
    </>
  );
}
