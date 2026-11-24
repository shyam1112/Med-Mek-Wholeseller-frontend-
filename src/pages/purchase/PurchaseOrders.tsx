import { useState } from 'react';
import { Box, Button, IconButton, LinearProgress, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Col } from '../../components/DataTable';
import { FilterBar, SearchBox, DateRange } from '../../components/Filters';
import { PartyPicker, PartyOption } from '../../components/Pickers';
import { StatusChip } from '../../components/StatusChip';
import { useConfirm } from '../../components/Dialogs';
import { useFetch, useDebounced, useHotkey } from '../../lib/hooks';
import { amt, fdate, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Order, STATUS_TABS, fulfilledPct } from '../sales/orderUtils';
import { printPO, whatsAppPO } from './poShare';

export default function PurchaseOrders() {
  const nav = useNavigate();
  const { can, business } = useAuth();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState('open,partial');
  const [from, setFrom] = useState(dayjs().subtract(90, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const q = useDebounced(search);
  const params = { status: tab, from, to, search: q, party: party?._id, page: page + 1, limit };
  const { data, loading, reload } = useFetch<{ data: Order[]; pagination: { total: number } }>('/purchase-orders', params);
  const rows = data?.data || [];
  const pending = (o: Order) => o.status === 'open' || o.status === 'partial';

  useHotkey('alt+n', () => can('purchase_orders:create') && nav('/purchase-orders/new'));

  const cancel = async (o: Order) => {
    const { ok, text } = await confirm({ title: `Cancel PO ${o.number}?`, message: 'Pending quantities on this PO will no longer be expected from the supplier.', prompt: 'Reason', danger: true, confirmText: 'Cancel PO' });
    if (!ok) return;
    try {
      await api.post(`/purchase-orders/${o._id}/cancel`, { reason: text });
      enqueueSnackbar(`PO ${o.number} cancelled`, { variant: 'success' });
      reload();
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const overdue = (o: Order) => pending(o) && o.expectedDate && dayjs(o.expectedDate).isBefore(dayjs(), 'day');

  const columns: Col<Order>[] = [
    { key: 'number', label: 'PO No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: 'Supplier' },
    { key: 'expectedDate', label: 'Expected', nowrap: true, render: (r) => <Typography fontSize={13} color={overdue(r) ? 'error.main' : undefined} fontWeight={overdue(r) ? 600 : 400}>{fdate(r.expectedDate)}</Typography> },
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items.length },
    { key: 'estimatedTotal', label: 'Est. Value', align: 'right', render: (r) => <b>{amt(r.estimatedTotal)}</b>, footer: amt(rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.estimatedTotal, 0)) },
    {
      key: 'fulfilled', label: 'Received', width: 110, render: (r) => {
        const p = fulfilledPct(r);
        return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LinearProgress variant="determinate" value={p} sx={{ flex: 1, height: 6, borderRadius: 3 }} color={p >= 100 ? 'success' : 'primary'} /><Typography fontSize={11} sx={{ width: 30, textAlign: 'right' }}>{p}%</Typography></Box>;
      },
    },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    {
      key: 'actions', label: '', align: 'right', nowrap: true, render: (r) => (
        <>
          {business && <Tooltip title="Print PO"><IconButton onClick={stop(() => printPO(r, business))}><PrintOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
          <Tooltip title="WhatsApp PO to supplier"><IconButton color="success" onClick={stop(() => whatsAppPO(r, business))}><WhatsAppIcon fontSize="small" /></IconButton></Tooltip>
          {pending(r) && can('purchases:create') && <Tooltip title="Receive goods (make purchase)"><IconButton color="primary" onClick={stop(() => nav(`/purchases/new?po=${r._id}`))}><MoveToInboxOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
          {pending(r) && can('purchase_orders:cancel') && <Tooltip title="Cancel PO"><IconButton color="error" onClick={stop(() => cancel(r))}><BlockOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
        </>
      ),
    },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get('/purchase-orders', { params: { ...params, page: 1, limit: 500 } });
      const list = r.data.data as Order[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exportExcel<any>(`purchase-orders-${from}-to-${to}`, [
        { name: 'POs', rows: list, columns: [
          { key: 'number', label: 'PO No' }, { key: 'date', label: 'Date', value: (o) => fdate(o.date) }, { key: 'partyName', label: 'Supplier' },
          { key: 'expectedDate', label: 'Expected', value: (o) => fdate(o.expectedDate) }, { key: 'items', label: 'Items', value: (o) => o.items.length },
          { key: 'estimatedTotal', label: 'Est. Value' }, { key: 'fulfilled', label: 'Received %', value: (o) => fulfilledPct(o) }, { key: 'status', label: 'Status' },
        ] },
        { name: 'Items', rows: list.flatMap((o) => o.items.map((i) => ({ ...i, po: o.number, partyName: o.partyName, status: o.status }))), columns: [
          { key: 'po', label: 'PO No' }, { key: 'partyName', label: 'Supplier' }, { key: 'productName', label: 'Product' }, { key: 'manufacturerName', label: 'Company' },
          { key: 'packing', label: 'Pack' }, { key: 'qty', label: 'Qty' }, { key: 'freeQty', label: 'Free' }, { key: 'rate', label: 'Rate' },
          { key: 'fulfilledQty', label: 'Received' }, { key: 'pending', label: 'Pending', value: (i) => Math.max(0, i.qty - (i.fulfilledQty || 0)) }, { key: 'status', label: 'PO status' },
        ] },
      ]);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="What's been ordered from suppliers and is still to arrive"
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can('purchase_orders:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/purchase-orders/new')}>New PO (Alt+N)</Button>}
          </>
        }
      />
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }} variant="scrollable">
        {STATUS_TABS.map((t) => <Tab key={t.label} value={t.value} label={t.label} />)}
      </Tabs>
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="PO no / supplier" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type="supplier" value={party} onChange={(v) => { setParty(v); setPage(0); }} sx={{ width: { xs: '100%', sm: 240 } }} />
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
        onRowClick={(r) => nav(`/purchase-orders/${r._id}`)}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)}
        empty={tab === 'open,partial' ? 'No pending purchase orders.' : 'No purchase orders found.'}
      />
    </>
  );
}
