import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper, Tab,
  Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
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
import { amt, fdate, fexp, num, today } from '../../lib/format';
import { exportExcel } from '../../lib/excel';
import { api, errMsg } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Order, STATUS_TABS, fulfilledPct, sourceLabel, reservationSummary } from './orderUtils';

interface FillResult {
  order: Order;
  lines: { product: string; productName: string; batchNo: string; expiry: string; qty: number; freeQty: number; available: number }[];
  shortages: { product: string; productName: string; short: number }[];
}

export default function SalesOrders() {
  const nav = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState('open,partial');
  const [from, setFrom] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<PartyOption | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [fill, setFill] = useState<{ order: Order; data: FillResult | null; loading: boolean } | null>(null);
  const q = useDebounced(search);
  const params = { status: tab, from, to, search: q, party: party?._id, page: page + 1, limit };
  const { data, loading, reload } = useFetch<{ data: Order[]; pagination: { total: number } }>('/sales-orders', params);
  const rows = data?.data || [];
  const pending = (o: Order) => o.status === 'open' || o.status === 'partial';

  useHotkey('alt+n', () => can('sales_orders:create') && nav('/sales-orders/new'));

  const showShortage = async (o: Order) => {
    setFill({ order: o, data: null, loading: true });
    try {
      const r = await api.get(`/sales-orders/${o._id}/fill`);
      setFill({ order: o, data: r.data, loading: false });
    } catch (e) {
      enqueueSnackbar(errMsg(e), { variant: 'error' });
      setFill(null);
    }
  };

  const cancel = async (o: Order) => {
    const { ok, text } = await confirm({
      title: `Cancel order ${o.number}?`,
      message: o.status === 'partial' ? 'Part of this order is already billed. Cancelling closes the pending balance; bills already made are not affected.' : 'The order will be closed and no longer appear in pending orders.',
      prompt: 'Reason', danger: true, confirmText: 'Cancel order',
    });
    if (!ok) return;
    try {
      await api.post(`/sales-orders/${o._id}/cancel`, { reason: text });
      enqueueSnackbar(`Order ${o.number} cancelled`, { variant: 'success' });
      reload();
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  const columns: Col<Order>[] = [
    { key: 'number', label: 'Order No', nowrap: true, render: (r) => <Typography fontWeight={600} fontSize={13}>{r.number}</Typography> },
    { key: 'date', label: 'Date', nowrap: true, render: (r) => fdate(r.date) },
    { key: 'partyName', label: 'Party', render: (r) => <>{r.partyName}{r.deliveryDate && <Typography fontSize={11} color="text.secondary">Deliver by {fdate(r.deliveryDate)}</Typography>}</> },
    { key: 'salesmanName', label: 'Salesman' },
    { key: 'source', label: 'Source', render: (r) => <Chip label={sourceLabel(r.source)} variant="outlined" sx={{ height: 20, fontSize: 11 }} /> },
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items.length },
    { key: 'estimatedTotal', label: 'Est. Total', align: 'right', render: (r) => <b>{amt(r.estimatedTotal)}</b>, footer: amt(rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + r.estimatedTotal, 0)) },
    {
      key: 'fulfilled', label: 'Billed', width: 110, render: (r) => {
        const p = fulfilledPct(r);
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinearProgress variant="determinate" value={p} sx={{ flex: 1, height: 6, borderRadius: 3 }} color={p >= 100 ? 'success' : 'primary'} />
            <Typography fontSize={11} sx={{ width: 30, textAlign: 'right' }}>{p}%</Typography>
          </Box>
        );
      },
    },
    {
      key: 'held', label: 'Stock held', nowrap: true, render: (r) => {
        const h = reservationSummary(r);
        if (!h.live) return null;
        if (!h.active) return <Typography fontSize={11} color="text.secondary">Not held</Typography>;
        return (
          <Tooltip title={`Held until ${fdate(r.reserveUntil)}`}>
            <Chip label={h.short ? `${num(h.held)} held · short ${num(h.short)}` : `${num(h.held)} held`} color={h.short ? 'warning' : 'success'} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          </Tooltip>
        );
      },
    },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    {
      key: 'actions', label: '', align: 'right', nowrap: true, render: (r) => pending(r) ? (
        <>
          {can('sales:create') && (
            <>
              <Tooltip title="Check stock shortage"><IconButton onClick={stop(() => showShortage(r))}><InventoryOutlinedIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Make bill from this order"><IconButton color="primary" onClick={stop(() => nav(`/sales/new?order=${r._id}`))}><ReceiptLongOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            </>
          )}
          {can('sales_orders:cancel') && <Tooltip title="Cancel order"><IconButton color="error" onClick={stop(() => cancel(r))}><BlockOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
        </>
      ) : null,
    },
  ];

  const exportAll = async () => {
    try {
      const r = await api.get('/sales-orders', { params: { ...params, page: 1, limit: 500 } });
      const list = r.data.data as Order[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exportExcel<any>(`sales-orders-${from}-to-${to}`, [
        {
          name: 'Orders', rows: list, columns: [
            { key: 'number', label: 'Order No' }, { key: 'date', label: 'Date', value: (o) => fdate(o.date) },
            { key: 'partyName', label: 'Party' }, { key: 'salesmanName', label: 'Salesman' },
            { key: 'source', label: 'Source', value: (o) => sourceLabel(o.source) },
            { key: 'items', label: 'Items', value: (o) => o.items.length }, { key: 'estimatedTotal', label: 'Est. Total' },
            { key: 'fulfilled', label: 'Billed %', value: (o) => fulfilledPct(o) }, { key: 'status', label: 'Status' },
          ],
        },
        {
          name: 'Pending items',
          rows: list.filter(pending).flatMap((o) => o.items.filter((i) => i.qty > (i.fulfilledQty || 0)).map((i) => ({ ...i, order: o.number, partyName: o.partyName }))),
          columns: [
            { key: 'order', label: 'Order No' }, { key: 'partyName', label: 'Party' }, { key: 'productName', label: 'Product' },
            { key: 'packing', label: 'Pack' }, { key: 'qty', label: 'Ordered' }, { key: 'fulfilledQty', label: 'Billed' },
            { key: 'pending', label: 'Pending', value: (i) => i.qty - (i.fulfilledQty || 0) }, { key: 'freeQty', label: 'Free' },
          ],
        },
      ]);
    } catch (e) { enqueueSnackbar(errMsg(e), { variant: 'error' }); }
  };

  const fd = fill?.data;
  return (
    <>
      <PageHeader
        title="Sales Orders"
        subtitle="Orders booked by salesmen, phone and WhatsApp — bill them when stock is ready"
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportAll}>Excel</Button>
            {can('sales_orders:create') && <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/sales-orders/new')}>New Order (Alt+N)</Button>}
          </>
        }
      />
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }} variant="scrollable">
        {STATUS_TABS.map((t) => <Tab key={t.label} value={t.value} label={t.label} />)}
      </Tabs>
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Order no / party" />
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(0); }} />
        <PartyPicker type="customer" value={party} onChange={(v) => { setParty(v); setPage(0); }} sx={{ width: { xs: '100%', sm: 240 } }} />
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
        onRowClick={(r) => nav(`/sales-orders/${r._id}`)}
        rowSx={(r) => (r.status === 'cancelled' ? { opacity: 0.5 } : undefined)}
        empty={tab === 'open,partial' ? 'No pending orders in this period.' : 'No orders found.'}
      />

      <Dialog open={!!fill} onClose={() => setFill(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Stock check — {fill?.order.number}<Typography variant="body2" color="text.secondary">{fill?.order.partyName}</Typography></DialogTitle>
        <DialogContent dividers>
          {fill?.loading && <LinearProgress />}
          {fd && (
            <>
              {fd.shortages.length === 0
                ? <Alert severity="success" sx={{ mb: 2 }}>Everything pending on this order is in stock (FEFO, within minimum-expiry rule). Ready to bill.</Alert>
                : <Alert severity="warning" sx={{ mb: 2 }}>{fd.shortages.length} item(s) can't be filled fully. The bill will carry only what's available; the rest stays pending on the order.</Alert>}
              {fd.shortages.length > 0 && (
                <Paper variant="outlined" sx={{ mb: 2 }}>
                  <Table>
                    <TableHead><TableRow><TableCell>Short item</TableCell><TableCell align="right">Short qty</TableCell></TableRow></TableHead>
                    <TableBody>
                      {fd.shortages.map((s) => (
                        <TableRow key={s.product}><TableCell>{s.productName}</TableCell><TableCell align="right"><Typography color="error.main" fontWeight={700} fontSize={13}>{num(s.short)}</Typography></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              )}
              {fd.lines.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Will be billed from</Typography>
                  <Paper variant="outlined">
                    <Table>
                      <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Exp</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Free</TableCell></TableRow></TableHead>
                      <TableBody>
                        {fd.lines.map((l, i) => (
                          <TableRow key={i}><TableCell>{l.productName}</TableCell><TableCell>{l.batchNo}</TableCell><TableCell>{fexp(l.expiry)}</TableCell><TableCell align="right">{l.qty}</TableCell><TableCell align="right">{l.freeQty || ''}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {fd && fd.shortages.length > 0 && can('purchase_orders:create') && <Button onClick={() => nav('/purchase-orders/new')}>Raise purchase order</Button>}
          <Button onClick={() => setFill(null)}>Close</Button>
          {fd && fd.lines.length > 0 && <Button variant="contained" onClick={() => nav(`/sales/new?order=${fill!.order._id}`)}>Make Bill</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}
